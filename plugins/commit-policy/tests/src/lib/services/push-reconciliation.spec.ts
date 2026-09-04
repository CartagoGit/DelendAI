import { describe, expect, it } from 'vitest';

import {
	decidePushReconciliation,
	type IBranchSyncState,
	type IPushGuards,
} from '@delendai/commit-policy/lib/services/push-reconciliation';

const state = (partial: Partial<IBranchSyncState> = {}): IBranchSyncState => ({
	branch: 'develop',
	aheadCount: 0,
	dirtyCount: 0,
	...partial,
});

const guards = (partial: Partial<IPushGuards> = {}): IPushGuards => ({
	enabled: true,
	protectedBranches: ['main', 'master'],
	...partial,
});

describe('push reconciliation (x00427 S1)', () => {
	describe('a clean worktree ahead of upstream is not "nothing to do"', () => {
		it('pushes commits this process never made', () => {
			// The observed bug: six commits sat unpushed because the engine
			// only pushes under `commitCreated`, and another agent had
			// already committed everything, leaving the tree clean.
			const decision = decidePushReconciliation(
				state({ aheadCount: 6, dirtyCount: 0 }),
				guards(),
			);

			expect(decision.shouldPush).toBe(true);
			expect(decision.action).toBe('push-unpushed-commits');
			expect(decision.reason).toContain('6 commits ahead');
			expect(decision.reason).toContain('whoever made them');
		});

		it('pushes regardless of whether the worktree is dirty', () => {
			for (const dirtyCount of [0, 3]) {
				expect(
					decidePushReconciliation(
						state({ aheadCount: 1, dirtyCount }),
						guards(),
					).shouldPush,
				).toBe(true);
			}
		});

		it('says nothing to do when the branch is level, as a resting state', () => {
			const decision = decidePushReconciliation(
				state({ aheadCount: 0 }),
				guards(),
			);

			expect(decision.action).toBe('nothing-to-do');
			expect(decision.shouldPush).toBe(false);
			expect(decision.needsAttention).toBe(false);
		});
	});

	describe('a branch with no upstream is not a branch that is up to date', () => {
		it('is reported as its own state, not as zero commits ahead', () => {
			const decision = decidePushReconciliation(
				state({ aheadCount: undefined }),
				guards(),
			);

			expect(decision.action).toBe('no-upstream');
			expect(decision.shouldPush).toBe(false);
		});

		it('asks for attention, because silence would hide work going nowhere', () => {
			const decision = decidePushReconciliation(
				state({ aheadCount: undefined }),
				guards(),
			);

			expect(decision.needsAttention).toBe(true);
			expect(decision.reason).toContain('no upstream');
			expect(decision.reason).toContain('not in sync');
		});
	});

	describe('the guards are absolute — this changes when, never what is allowed', () => {
		it('never pushes when push is disabled, however far ahead the branch is', () => {
			const decision = decidePushReconciliation(
				state({ aheadCount: 99 }),
				guards({ enabled: false }),
			);

			expect(decision.shouldPush).toBe(false);
			expect(decision.action).toBe('push-disabled');
			expect(decision.needsAttention).toBe(false);
		});

		it('never pushes to a protected branch', () => {
			for (const branch of ['main', 'master']) {
				const decision = decidePushReconciliation(
					state({ branch, aheadCount: 4 }),
					guards(),
				);
				expect(decision.shouldPush).toBe(false);
				expect(decision.action).toBe('branch-protected');
			}
		});

		it('checks the guards before the branch state, so drift cannot argue past them', () => {
			// A disabled push on a protected branch with no upstream still
			// resolves to "disabled": the refusal is not reachable around.
			const decision = decidePushReconciliation(
				state({ branch: 'main', aheadCount: undefined }),
				guards({ enabled: false }),
			);

			expect(decision.action).toBe('push-disabled');
		});

		it('does not treat a partial name as a protected branch', () => {
			expect(
				decidePushReconciliation(
					state({ branch: 'maintenance', aheadCount: 1 }),
					guards(),
				).shouldPush,
			).toBe(true);
		});

		it('pushes a normal branch when nothing is protected', () => {
			expect(
				decidePushReconciliation(
					state({ branch: 'develop', aheadCount: 1 }),
					guards({ protectedBranches: [] }),
				).shouldPush,
			).toBe(true);
		});
	});

	describe('exactly one action pushes', () => {
		it('shouldPush is true only for push-unpushed-commits', () => {
			const cases: readonly [IBranchSyncState, IPushGuards][] = [
				[state({ aheadCount: 2 }), guards()],
				[state({ aheadCount: 0 }), guards()],
				[state({ aheadCount: undefined }), guards()],
				[state({ aheadCount: 2 }), guards({ enabled: false })],
				[state({ branch: 'main', aheadCount: 2 }), guards()],
			];

			for (const [branchState, pushGuards] of cases) {
				const decision = decidePushReconciliation(
					branchState,
					pushGuards,
				);
				expect(decision.shouldPush).toBe(
					decision.action === 'push-unpushed-commits',
				);
			}
		});

		it('always explains itself', () => {
			for (const aheadCount of [undefined, 0, 1]) {
				expect(
					decidePushReconciliation(state({ aheadCount }), guards())
						.reason.length,
				).toBeGreaterThan(20);
			}
		});
	});
});
