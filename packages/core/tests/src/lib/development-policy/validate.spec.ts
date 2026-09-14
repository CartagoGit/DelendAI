/**
 * validate.spec.ts — an incoherent policy must fail startup with a
 * concrete diagnostic, never be improvised around. Each test names the
 * rule id so a future change to the wording does not quietly drop a rule.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	validateDevelopmentPolicy,
	validatePolicyAlignment,
} from '@delendai/core/lib/development-policy/validate';

const rulesFor = (development: Record<string, unknown>): readonly string[] =>
	validateDevelopmentPolicy(resolveDevelopmentPolicy({ development })).map(
		(violation) => violation.rule,
	);

describe('validateDevelopmentPolicy', () => {
	it('accepts a profile that needs nothing named', () => {
		expect(rulesFor({ profile: 'shared-direct' })).toEqual([]);
	});

	it('makes a pull-request profile name its own required checks', () => {
		// A profile CANNOT know what this project's CI calls its checks,
		// and the cost of guessing is not hypothetical: `main` in this
		// very repository required a `ci-complete` context that no
		// workflow produced, so for months nothing could merge into it.
		// The profiles used to ship exactly that string as their default.
		//
		// So an unconfigured pull-request profile is now INVALID rather
		// than plausible. It fails at config time, naming the path and
		// the remedy, instead of at merge time with a gate that can
		// never go green.
		for (const profile of ['shared-checkout-pr', 'worktree-pr']) {
			expect(rulesFor({ profile })).toEqual([
				'enforced-governance-needs-checks',
			]);
		}
	});

	it('accepts a pull-request profile once the checks are named', () => {
		for (const profile of ['shared-checkout-pr', 'worktree-pr']) {
			expect(
				rulesFor({
					profile,
					integration: { requiredChecks: ['delendai-validate'] },
				}),
			).toEqual([]);
		}
	});

	it('rejects a shared tree with no coordination', () => {
		expect(
			rulesFor({
				profile: 'shared-direct',
				coordination: { strategy: 'none' },
			}),
		).toContain('shared-tree-needs-claims');
	});

	it('rejects wip refs that integrate directly', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: { strategy: 'direct' },
			}),
		).toContain('wip-ref-needs-certification');
	});

	it('accepts wip refs integrated by merge, because that still certifies', () => {
		// The rule is about certification, not about pull requests. A
		// forge the project does not administer cannot hold a check; the
		// local gate can. What must never pass is a wip ref with NOTHING
		// between it and the integration branch, which is the case above.
		expect(rulesFor({ profile: 'shared-checkout-merge' })).toEqual([]);
	});

	it('refuses to promise recovery for work that never leaves the machine', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: { requiredChecks: ['delendai-validate'] },
				persistence: { autoPushAfterCommit: false },
			}),
		).toContain('resumable-work-must-leave-the-machine');
	});

	it('rejects worktrees that commit straight to the integration branch', () => {
		expect(
			rulesFor({
				profile: 'worktree-pr',
				persistence: { strategy: 'direct-commit' },
			}),
		).toContain('worktree-needs-own-ref');
	});

	it('rejects recovery of work that has no separate ref', () => {
		expect(
			rulesFor({
				profile: 'shared-direct',
				recovery: { strategy: 'resume-wip' },
			}),
		).toContain('recovery-needs-durable-ref');
	});

	it('rejects an integration branch that is also the release branch', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				branches: { integration: 'main', release: 'main' },
			}),
		).toContain('release-must-differ');
	});

	it('rejects a work-ref template that cannot distinguish generations', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				branches: {
					workRefTemplate: 'wip/${agent}/${proposal}-${slice}',
				},
			}),
		).toContain('work-ref-template-needs-generation');
	});

	it('rejects enforced governance with no required check', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: { requiredChecks: [] },
			}),
		).toContain('enforced-governance-needs-checks');
	});

	it('rejects an interval-driven cadence with no interval', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				checkpoint: { strategy: 'interval', intervalMinutes: 0 },
			}),
		).toContain('interval-needs-minutes');
	});

	it('rejects claims whose leases never expire', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				coordination: { leaseTtlMinutes: 0 },
			}),
		).toContain('claims-need-lease-ttl');
	});

	it('defaults every profile to autonomous integration', () => {
		// 0 approvals is the point of the model: certified green work
		// merges without waiting for a person.
		for (const profile of [
			'shared-direct',
			'shared-checkout-pr',
			'worktree-pr',
		]) {
			const policy = resolveDevelopmentPolicy({
				development: { profile },
			});
			expect(policy.integration.requiredApprovals).toBe(0);
			expect(policy.integration.releaseRequiredApprovals).toBe(0);
		}
	});

	it('rejects a release branch that is easier to merge than integration', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: {
					requiredApprovals: 2,
					releaseRequiredApprovals: 1,
				},
			}),
		).toContain('release-approvals-not-weaker');
	});

	it('rejects a fractional or negative approval count', () => {
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: { requiredApprovals: -1 },
			}),
		).toContain('approvals-must-be-whole');
		expect(
			rulesFor({
				profile: 'shared-checkout-pr',
				integration: { requiredApprovals: 1.5 },
			}),
		).toContain('approvals-must-be-whole');
	});

	it('reports a typo as an unknown strategy, not a crash', () => {
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({
				development: {
					profile: 'shared-checkout-pr',
					persistence: { strategy: 'wip-refs' },
				},
			}),
		);

		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe('unknown-strategy');
		expect(violations[0]?.path).toBe('persistence.strategy');
		// The remedy must name the values that would have worked.
		expect(violations[0]?.remedy).toContain('wip-ref');
	});

	it('rejects a legacy worktree config that nothing can persist', () => {
		// `agentWorktree: true` was never a pull-request model — it only
		// said WHERE an agent edits. Resolved forward it lands on
		// worktrees + `branch` persistence, and commit-policy has no
		// route that publishes that. Before this rule the combination
		// resolved silently and failed later, at the first commit, with
		// no diagnostic naming the config that caused it.
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({ legacy: { agentWorktree: true } }),
		);

		expect(violations.map((v) => v.rule)).toContain(
			'legacy-worktree-persistence-unsupported',
		);
		expect(
			violations.find(
				(v) => v.rule === 'legacy-worktree-persistence-unsupported',
			)?.path,
		).toBe('agentWorktree');
	});

	it('leaves a legacy config without worktrees alone', () => {
		// The compatibility promise is unchanged for every legacy project
		// that did NOT set `agentWorktree`: it still resolves clean.
		expect(
			validateDevelopmentPolicy(
				resolveDevelopmentPolicy({ legacy: { agentWorktree: false } }),
			),
		).toEqual([]);
	});

	it('reports an unknown profile by name', () => {
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({
				development: { profile: 'shared-wip-pr' },
			}),
		);

		expect(violations.map((v) => v.rule)).toContain('unknown-profile');
		expect(violations[0]?.message).toContain('shared-wip-pr');
	});

	it('withholds cross-axis complaints until spelling is fixed', () => {
		// A typo'd strategy would otherwise cascade into several confusing
		// follow-on rules; the operator is asked to fix the name first.
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({
				development: {
					profile: 'shared-direct',
					coordination: { strategy: 'nope' },
				},
			}),
		);

		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe('unknown-strategy');
	});
});

/**
 * The half of #105 that was written and never called.
 *
 * #105 added a detector for a config that contradicts its own profile,
 * tested it in isolation, and wired only the other half. So a config
 * declaring `shared-checkout-pr` while naming the integration branch as
 * commit-policy's push target still started cleanly — the rule existed
 * and nothing ran it, which is the exact shape of every bug this file
 * guards against.
 *
 * It lives in core rather than in the plugin because writing the
 * semantics of the policy a second time is what produced the
 * contradiction in the first place.
 */
describe('validatePolicyAlignment', () => {
	const pullRequestPolicy = () =>
		resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				integration: { requiredChecks: ['delendai-validate'] },
			},
		});

	it('refuses a push target that is the integration branch', () => {
		const found = validatePolicyAlignment(pullRequestPolicy(), {
			push: { branch: 'develop' },
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.path).toBe(
			'plugins.commit-policy.options.push.branch',
		);
	});

	it('names the remedy, not only the fault', () => {
		expect(
			validatePolicyAlignment(pullRequestPolicy(), {
				push: { branch: 'develop' },
			})[0]?.remedy,
		).toContain('Remove `push.branch`');
	});

	it('is quiet when no push branch is configured', () => {
		expect(
			validatePolicyAlignment(pullRequestPolicy(), { push: {} }),
		).toEqual([]);
	});

	it('is quiet about a push target that is a publication ref', () => {
		expect(
			validatePolicyAlignment(pullRequestPolicy(), {
				push: { branch: 'delendai/pr/x' },
			}),
		).toEqual([]);
	});

	// A project that opted into direct commits is not second-guessed.
	it('is quiet under a policy that permits direct integration commits', () => {
		expect(
			validatePolicyAlignment(
				resolveDevelopmentPolicy({
					development: { profile: 'shared-direct' },
				}),
				{ push: { branch: 'develop' } },
			),
		).toEqual([]);
	});

	it('is quiet when the plugin has no options at all', () => {
		expect(validatePolicyAlignment(pullRequestPolicy(), undefined)).toEqual(
			[],
		);
	});

	// x00540. `agentWorktree: true` resolves to `strategy: 'branch'`,
	// whose derived flags are exactly the pair commit-policy has no route
	// for. The system started clean and then refused to persist ONE SLICE
	// AT A TIME, leaving each slice's work uncommitted, while the config
	// still read `commit.enabled: true`. `auto-work.e2e` sat waiting for
	// a remote ref that could never arrive.
	it('refuses a config that asks commit-policy to persist with no route to do it', () => {
		const found = validatePolicyAlignment(
			resolveDevelopmentPolicy({
				legacy: { agentWorktree: true },
			}),
			{ commit: { enabled: true } },
		);
		expect(found.map((v) => v.rule)).toContain(
			'commit-policy-has-no-persistence-route',
		);
	});

	it('says it at startup rather than once per slice', () => {
		// The refusal per slice was correct and well worded. Its TIMING
		// was the defect: by the time it fires the work exists, and the
		// operator has to reconstruct what became of it.
		const found = validatePolicyAlignment(
			resolveDevelopmentPolicy({
				legacy: { agentWorktree: true },
			}),
			{ commit: { enabled: true } },
		);
		const violation = found.find(
			(v) => v.rule === 'commit-policy-has-no-persistence-route',
		);
		expect(violation?.path).toBe(
			'plugins.commit-policy.options.commit.enabled',
		);
		expect(violation?.remedy).toContain('worktree host');
	});

	it('is quiet when that config does not ask the plugin to persist', () => {
		// `worktree-pr` persists through the worktree host. A policy with
		// no commit-policy route is perfectly healthy on its own; it is
		// only a contradiction when something has ALSO been told to
		// persist through the plugin.
		expect(
			validatePolicyAlignment(
				resolveDevelopmentPolicy({
					legacy: { agentWorktree: true },
				}),
				{
					commit: { enabled: false },
				},
			),
		).toEqual([]);
	});

	it('is quiet under a policy that does have a route', () => {
		expect(
			validatePolicyAlignment(pullRequestPolicy(), {
				commit: { enabled: true },
			}),
		).toEqual([]);
	});
});
