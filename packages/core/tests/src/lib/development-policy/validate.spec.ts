/**
 * validate.spec.ts — an incoherent policy must fail startup with a
 * concrete diagnostic, never be improvised around. Each test names the
 * rule id so a future change to the wording does not quietly drop a rule.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

const rulesFor = (development: Record<string, unknown>): readonly string[] =>
	validateDevelopmentPolicy(
		resolveDevelopmentPolicy({ development }),
	).map((violation) => violation.rule);

describe('validateDevelopmentPolicy', () => {
	it('accepts every built-in profile', () => {
		for (const profile of [
			'shared-direct',
			'shared-checkout-pr',
			'worktree-pr',
		]) {
			expect(rulesFor({ profile })).toEqual([]);
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
		).toContain('wip-ref-needs-pull-request');
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
				branches: { workRefTemplate: 'wip/${agent}/${proposal}-${slice}' },
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
