/**
 * tri-state-verdict.spec.ts — the specs that exist because a gate which
 * lies about being green is the failure mode this subsystem was built to
 * prevent.
 *
 * They hold three lines. A property whose live value cannot be read is
 * `NOT_EXECUTABLE` and never a pass. Applying is not verifying, so a forge
 * that accepts a write and then reports something else must fail
 * `verifyDesiredState`. And no result object, diff or error message may
 * ever contain a token value.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	applyDesiredState,
	branchPropertyId,
	buildDesiredState,
	type IForgeRepositoryRef,
	inspectDesiredVsLive,
	isPassingVerdict,
	liveUnreadable,
	liveValue,
	reconcileForgeGovernance,
	repositoryPropertyId,
	verifyDesiredState,
} from '@delendai/core/lib/forge-governance/index';

import {
	createFakeForgeAdapter,
	liveStateFromDesired,
	SENTINEL_TOKEN,
} from './fake-forge-adapter';

const TARGET: IForgeRepositoryRef = { owner: 'acme', repository: 'widgets' };
const desiredFor = (profile: 'shared-checkout-pr' | 'shared-direct') =>
	buildDesiredState(expandProfile(profile));

describe('tri-state verdicts', () => {
	it('passes only when every applicable property was READ and matched', async () => {
		const desired = desiredFor('shared-checkout-pr');
		const adapter = createFakeForgeAdapter({
			properties: liveStateFromDesired(desired),
		});

		const verification = await verifyDesiredState({
			adapter,
			desired,
			target: TARGET,
		});

		expect(verification.verdict).toBe('PASS');
		expect(verification.passed).toBe(true);
		expect(verification.diff.notExecutable).toEqual([]);
	});

	it('reports an unreadable property NOT_EXECUTABLE and refuses to call the run a pass', () => {
		const desired = desiredFor('shared-checkout-pr');
		const properties = liveStateFromDesired(desired);
		// NOT `requiredChecks`: with no check names in the profile
		// (aabad2cd) that property, and `requireChecksUpToDate` with it,
		// is declared not-applicable, so blinding it would be excluded
		// from the fold and prove nothing. `requirePullRequest` is
		// governed unconditionally.
		const blind = branchPropertyId('develop', 'requirePullRequest');
		properties[blind] = liveUnreadable(
			`HTTP 403 while reading with ${SENTINEL_TOKEN}`,
		);

		const diff = inspectDesiredVsLive({
			desired,
			live: { provider: 'github', properties },
			target: TARGET,
		});
		const row = diff.properties.find((property) => property.id === blind);

		expect(row?.status).toBe('NOT_EXECUTABLE');
		expect(row?.live).toBeUndefined();
		expect(diff.verdict).toBe('NOT_EXECUTABLE');
		expect(isPassingVerdict(diff.verdict)).toBe(false);
		expect(diff.notExecutable).toContain(blind);
	});

	it('treats a property the adapter never reported as NOT_EXECUTABLE, not as satisfied', () => {
		const desired = desiredFor('shared-checkout-pr');
		const properties = liveStateFromDesired(desired);
		const id = repositoryPropertyId('deleteBranchOnMerge');
		delete properties[id];

		const diff = inspectDesiredVsLive({
			desired,
			live: { provider: 'github', properties },
			target: TARGET,
		});

		expect(
			diff.properties.find((property) => property.id === id)?.status,
		).toBe('NOT_EXECUTABLE');
		expect(diff.verdict).not.toBe('PASS');
	});

	it('excludes only the properties the policy explicitly declared not-applicable', () => {
		const desired = desiredFor('shared-direct');
		const adapter = liveStateFromDesired(desired);
		// The forge has extra required contexts; a direct policy does not govern them.
		adapter[branchPropertyId('develop', 'requiredChecks')] = liveValue([
			'some-other-check',
		]);

		const diff = inspectDesiredVsLive({
			desired,
			live: { provider: 'github', properties: adapter },
			target: TARGET,
		});

		expect(diff.notApplicable).toContain(
			branchPropertyId('develop', 'requiredChecks'),
		);
		expect(diff.verdict).toBe('PASS');
	});

	it('lets FAIL dominate NOT_EXECUTABLE so a real mismatch is never hidden', () => {
		const desired = desiredFor('shared-checkout-pr');
		const properties = liveStateFromDesired(desired);
		properties[branchPropertyId('develop', 'requirePullRequest')] =
			liveValue(false);
		properties[branchPropertyId('main', 'enforceAdmins')] =
			liveUnreadable('API error');

		const diff = inspectDesiredVsLive({
			desired,
			live: { provider: 'github', properties },
			target: TARGET,
		});

		expect(diff.verdict).toBe('FAIL');
		expect(diff.failing).toContain(
			branchPropertyId('develop', 'requirePullRequest'),
		);
		expect(diff.notExecutable).toContain(
			branchPropertyId('main', 'enforceAdmins'),
		);
	});
});

describe('verifyDesiredState re-reads instead of trusting the write', () => {
	it('fails when the forge reports back something other than what was applied', async () => {
		const desired = desiredFor('shared-checkout-pr');
		const properties = liveStateFromDesired(desired);
		properties[branchPropertyId('develop', 'requirePullRequest')] =
			liveValue(false);
		const adapter = createFakeForgeAdapter({
			properties,
			distort: {
				// The forge accepts the write, then silently drops the gate.
				// This uses `requirePullRequest` rather than the strict-checks
				// flag because the latter is not-applicable while the profile
				// declares no check names (aabad2cd).
				branchRule: (rule) => ({
					...rule,
					requirePullRequest: false,
				}),
			},
		});

		const result = await reconcileForgeGovernance({
			adapter,
			desired,
			target: TARGET,
		});

		expect(result.before.verdict).toBe('FAIL');
		expect(result.applied.attempted).toBe(true);
		expect(result.applied.actions.every((action) => action.ok)).toBe(true);
		// The write "succeeded" — only the re-read exposes the truth.
		expect(result.verification.passed).toBe(false);
		expect(result.verification.verdict).toBe('FAIL');
		expect(result.verification.regressions).toContain(
			branchPropertyId('develop', 'requirePullRequest'),
		);
		expect(adapter.reads).toBeGreaterThan(1);
	});

	it('reconciles a fixable drift and then verifies it from a fresh read', async () => {
		const desired = desiredFor('shared-checkout-pr');
		const properties = liveStateFromDesired(desired);
		properties[branchPropertyId('develop', 'allowForcePush')] =
			liveValue(true);
		const adapter = createFakeForgeAdapter({ properties });

		const result = await reconcileForgeGovernance({
			adapter,
			desired,
			target: TARGET,
		});

		expect(result.before.verdict).toBe('FAIL');
		expect(result.verification.verdict).toBe('PASS');
		expect(result.verification.regressions).toEqual([]);
		expect(adapter.writes.some((write) => write.branch === 'develop')).toBe(
			true,
		);
	});

	it('never writes under an observed policy, and does not call that a pass', async () => {
		const desired = desiredFor('shared-direct');
		const properties = liveStateFromDesired(desired);
		properties[branchPropertyId('develop', 'allowForcePush')] =
			liveValue(true);
		const adapter = createFakeForgeAdapter({ properties });

		const applied = await applyDesiredState({
			adapter,
			desired,
			target: TARGET,
			diff: inspectDesiredVsLive({
				desired,
				live: { provider: 'github', properties },
				target: TARGET,
			}),
		});

		expect(desired.enforced).toBe(false);
		expect(applied.attempted).toBe(false);
		expect(adapter.writes).toEqual([]);
		expect(applied.skippedReason).toContain('enforced');
	});
});
