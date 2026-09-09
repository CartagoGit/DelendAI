/**
 * github-payloads.spec.ts — fixes the exact request bodies governance is
 * allowed to send, and proves the write path builds them from a
 * policy-derived rule and nothing else.
 *
 * The bodies matter because they are the whole blast radius of enforced
 * governance: anything not listed here is a setting the runtime can never
 * change. `restrictions: null` in particular is asserted, so a later edit
 * that starts writing push allow-lists cannot slip in unnoticed.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	buildDesiredState,
	createGithubForgeAdapter,
	findBranchRule,
	type IForgeRepositoryRef,
} from '@delendai/core/lib/forge-governance/index';
import {
	branchProtectionPayload,
	repositorySettingsPayload,
} from '@delendai/core/lib/forge-governance/github-payloads';

const TARGET: IForgeRepositoryRef = { owner: 'acme', repository: 'widgets' };
const desired = buildDesiredState(expandProfile('shared-checkout-pr'));

describe('branchProtectionPayload', () => {
	it('turns a pull-request integration rule into GitHub protection', () => {
		const rule = findBranchRule(desired, 'develop');
		if (rule === undefined) throw new Error('no develop rule');

		expect(branchProtectionPayload(rule)).toEqual({
			required_status_checks: {
				strict: true,
				contexts: ['ci-complete'],
			},
			enforce_admins: false,
			required_pull_request_reviews: {
				required_approving_review_count: 0,
				dismiss_stale_reviews: true,
				require_code_owner_reviews: false,
			},
			restrictions: null,
			required_linear_history: true,
			allow_force_pushes: false,
			allow_deletions: false,
			required_conversation_resolution: false,
		});
	});

	it('omits pull-request and check blocks for a direct-integration rule', () => {
		const direct = buildDesiredState(expandProfile('shared-direct'));
		const rule = findBranchRule(direct, 'develop');
		if (rule === undefined) throw new Error('no develop rule');
		const payload = branchProtectionPayload(rule);

		expect(payload.required_pull_request_reviews).toBeNull();
		expect(payload.required_status_checks).toBeNull();
		expect(payload.required_linear_history).toBe(true);
	});

	it('never writes a push allow-list', () => {
		for (const rule of desired.branches) {
			expect(branchProtectionPayload(rule).restrictions).toBeNull();
		}
	});
});

describe('repositorySettingsPayload', () => {
	it('enables only the policy mergeMethod', () => {
		expect(repositorySettingsPayload(desired.repository)).toEqual({
			allow_squash_merge: true,
			allow_merge_commit: false,
			allow_rebase_merge: false,
			delete_branch_on_merge: true,
		});
	});
});

describe('the GitHub adapter write path', () => {
	it('PUTs the derived protection body over stdin when mutations are enabled', async () => {
		const calls: { args: readonly string[]; stdin?: string }[] = [];
		const adapter = createGithubForgeAdapter({
			env: {},
			mutationsEnabled: true,
			exec: async (input) => {
				calls.push({
					args: input.args,
					...(input.stdin !== undefined
						? { stdin: input.stdin }
						: {}),
				});
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
		const rule = findBranchRule(desired, 'main');
		if (rule === undefined) throw new Error('no main rule');

		const outcome = await adapter.applyBranchRule({
			target: TARGET,
			rule,
		});

		expect(outcome.ok).toBe(true);
		const call = calls[0];
		expect(call?.args).toContain('PUT');
		expect(call?.args).toContain(
			'repos/acme/widgets/branches/main/protection',
		);
		expect(JSON.parse(call?.stdin ?? '{}')).toEqual(
			branchProtectionPayload(rule),
		);
	});

	it('PATCHes the repository settings and reports a redacted failure', async () => {
		const adapter = createGithubForgeAdapter({
			env: {},
			mutationsEnabled: true,
			exec: async () => ({
				ok: false,
				code: 1,
				stdout: '',
				stderr: 'HTTP 403: Resource not accessible by integration',
				timedOut: false,
				unavailable: false,
			}),
		});

		const outcome = await adapter.applyRepositorySettings({
			target: TARGET,
			settings: desired.repository,
		});

		expect(outcome.ok).toBe(false);
		expect(outcome.reason).toContain('403');
	});
});
