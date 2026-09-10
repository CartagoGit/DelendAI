/**
 * credential-safety.spec.ts — asserts, with a sentinel, that no token
 * value can reach a governance result.
 *
 * The rule is easy to state and easy to break by accident: an adapter
 * that quotes a provider's error body, or a diff that echoes a remote
 * URL, is one line away from serialising a credential into a log, a
 * SQLite row or a proposal artefact. So the fake adapter is deliberately
 * leaky — every failure path it can take carries `SENTINEL_TOKEN` — and
 * these specs serialise the WHOLE result and search it.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { redactSecrets } from '@delendai/core/lib/shared/redact';
import {
	branchPropertyId,
	buildDesiredState,
	createGithubForgeAdapter,
	type IForgeRepositoryRef,
	liveUnreadable,
	reconcileForgeGovernance,
	REDACTED,
	resolveForgeCredentialSeam,
} from '@delendai/core/lib/forge-governance/index';

import {
	createFakeForgeAdapter,
	liveStateFromDesired,
	SENTINEL_TOKEN,
} from './fake-forge-adapter';

const TARGET: IForgeRepositoryRef = { owner: 'acme', repository: 'widgets' };

describe('no token value ever reaches a result', () => {
	it('scrubs a token out of every diff, action and error message', async () => {
		const desired = buildDesiredState(expandProfile('shared-checkout-pr'));
		const properties = liveStateFromDesired(desired);
		properties[branchPropertyId('develop', 'requirePullRequest')] =
			liveUnreadable(
				`GET https://x-access-token:${SENTINEL_TOKEN}@github.com/acme/widgets failed (Authorization: Bearer ${SENTINEL_TOKEN})`,
			);
		const adapter = createFakeForgeAdapter({
			properties,
			writeFailureReason: `HTTP 403: token ${SENTINEL_TOKEN} lacks admin:repo`,
		});

		const result = await reconcileForgeGovernance({
			adapter,
			desired,
			target: TARGET,
		});
		const serialised = JSON.stringify(result);

		expect(serialised).not.toContain(SENTINEL_TOKEN);
		expect(serialised).toContain(REDACTED);
		expect(result.verification.passed).toBe(false);
	});

	it('redacts every token shape it is likely to meet', () => {
		for (const secret of [
			SENTINEL_TOKEN,
			'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ',
			'glpat-abcdefghijklmnopqrst',
			'Bearer abcdef1234567890',
			'https://user:s3cr3tp4ssword@github.com/acme/widgets',
		]) {
			// Through the shared redactor now: forge-governance's private
			// copy of the rules was merged into it, so this list is what
			// pins that the merge lost nothing.
			expect(redactSecrets(`prefix ${secret} suffix`).text).not.toContain(
				secret,
			);
		}
	});
});

describe('the credential seam describes the mechanism, never the material', () => {
	it('classifies GH_TOKEN without exposing its value', () => {
		const seam = resolveForgeCredentialSeam({ GH_TOKEN: SENTINEL_TOKEN });

		expect(seam.source).toBe('gh-token-env');
		expect(seam.tokenVariablePresent).toBe(true);
		expect(JSON.stringify(seam)).not.toContain(SENTINEL_TOKEN);
	});

	it('falls back to the gh CLI login rather than demanding a PAT', () => {
		const seam = resolveForgeCredentialSeam({});

		expect(seam.source).toBe('gh-cli-login');
		expect(seam.tokenVariablePresent).toBe(false);
	});

	it('prefers GH_TOKEN over GITHUB_TOKEN, matching the gh CLI', () => {
		expect(
			resolveForgeCredentialSeam({
				GH_TOKEN: SENTINEL_TOKEN,
				GITHUB_TOKEN: SENTINEL_TOKEN,
			}).source,
		).toBe('gh-token-env');
		expect(
			resolveForgeCredentialSeam({ GITHUB_TOKEN: SENTINEL_TOKEN }).source,
		).toBe('github-token-env');
	});
});

describe('the GitHub adapter never spawns gh with a secret and never writes by default', () => {
	it('reads through gh api with no credential in argv, stdin or cwd', async () => {
		const desired = buildDesiredState(expandProfile('shared-checkout-pr'));
		const seen: string[] = [];
		const adapter = createGithubForgeAdapter({
			env: { GH_TOKEN: SENTINEL_TOKEN },
			exec: async (input) => {
				seen.push(JSON.stringify(input));
				return {
					ok: false,
					code: 1,
					stdout: '',
					stderr: `HTTP 401: Bad credentials for ${SENTINEL_TOKEN}`,
					timedOut: false,
					unavailable: false,
				};
			},
		});

		const live = await adapter.readLiveState({
			target: TARGET,
			branches: desired.branches.map((rule) => rule.branch),
		});

		expect(seen.length).toBeGreaterThan(0);
		expect(seen.join('\n')).not.toContain(SENTINEL_TOKEN);
		expect(JSON.stringify(live)).not.toContain(SENTINEL_TOKEN);
		expect(
			Object.values(live.properties).every(
				(value) => value.kind === 'unreadable',
			),
		).toBe(true);
		expect(adapter.credentialSeam.source).toBe('gh-token-env');
	});

	it('refuses to mutate unless mutations were explicitly enabled', async () => {
		let calls = 0;
		const adapter = createGithubForgeAdapter({
			env: {},
			exec: async () => {
				calls += 1;
				return {
					ok: true,
					code: 0,
					stdout: '{}',
					stderr: '',
					timedOut: false,
					unavailable: false,
				};
			},
		});

		const outcome = await adapter.applyRepositorySettings({
			target: TARGET,
			settings: buildDesiredState(expandProfile('shared-checkout-pr'))
				.repository,
		});

		expect(adapter.mutationsEnabled).toBe(false);
		expect(outcome.ok).toBe(false);
		expect(calls).toBe(0);
	});
});
