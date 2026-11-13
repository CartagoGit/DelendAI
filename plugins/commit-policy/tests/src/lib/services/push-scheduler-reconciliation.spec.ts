/**
 * push-scheduler-reconciliation.spec.ts — x00427 S2.
 *
 * `everyNMinutes` used to decide two different things: how often to
 * reconcile, and whether to reconcile at all. These pin the separation.
 */
import { describe, expect, it } from 'vitest';

import type { ICommitPolicyPush } from '@delendai/commit-policy/lib/contracts/options';
import { resolveReconcileMinutes } from '@delendai/commit-policy/lib/services/push-scheduler';

const policy = (partial: Partial<ICommitPolicyPush> = {}): ICommitPolicyPush =>
	({
		enabled: true,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master'],
		...partial,
	}) as ICommitPolicyPush;

describe('reconciler cadence (x00427 S2)', () => {
	describe('a host that asked for automatic push gets reconciliation', () => {
		it('starts on onCommit alone, which is the configuration that failed', () => {
			// push.enabled + push.onCommit is exactly what this repository
			// had while six commits sat unpushed: onCommit cannot cover
			// commits this process did not make, and nothing else ran.
			expect(resolveReconcileMinutes(policy({ onCommit: true }))).toBe(5);
		});

		it('starts on everyNCommits too', () => {
			expect(resolveReconcileMinutes(policy({ everyNCommits: 3 }))).toBe(
				5,
			);
		});

		it('uses the declared cadence when there is one', () => {
			expect(
				resolveReconcileMinutes(
					policy({ onCommit: true, everyNMinutes: 30 }),
				),
			).toBe(30);
		});

		it('honours a declared cadence even without any other mode', () => {
			// everyNMinutes still means what it always meant on its own.
			expect(resolveReconcileMinutes(policy({ everyNMinutes: 15 }))).toBe(
				15,
			);
		});
	});

	describe('nothing starts where nothing was asked for', () => {
		it('stays off when push is disabled, whatever else is set', () => {
			for (const extra of [
				{ onCommit: true },
				{ everyNCommits: 2 },
				{ everyNMinutes: 5 },
			]) {
				expect(
					resolveReconcileMinutes(
						policy({ enabled: false, ...extra }),
					),
				).toBeUndefined();
			}
		});

		it('stays off when push is enabled but no automatic mode was requested', () => {
			// That host really did opt out: it wants `commit_policy_push`
			// and nothing else. Starting a timer for it would be taking a
			// decision it declined to take.
			expect(resolveReconcileMinutes(policy())).toBeUndefined();
		});
	});

	describe('the absence of everyNMinutes stops meaning "never"', () => {
		it('is the only thing that changed: with it set, behaviour is identical', () => {
			for (const minutes of [1, 5, 30, 120]) {
				expect(
					resolveReconcileMinutes(policy({ everyNMinutes: minutes })),
				).toBe(minutes);
			}
		});

		it('never returns a cadence that would spin', () => {
			const resolved = resolveReconcileMinutes(
				policy({ onCommit: true }),
			);
			expect(resolved).toBeGreaterThan(0);
		});
	});
});
