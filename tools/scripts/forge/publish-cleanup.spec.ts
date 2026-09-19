import { describe, expect, it } from 'vitest';

import type { ICleanupStep } from './publish-candidate.interface';
import { describeCleanup, runCleanupSteps } from './publish-cleanup';

const step = (
	label: string,
	behaviour: {
		throws?: string;
		doneAnyway?: boolean;
		verifyThrows?: boolean;
	},
	calls: string[],
): ICleanupStep => ({
	label,
	doneMessage: `removed ${label}.`,
	run: () => {
		calls.push(label);
		if (behaviour.throws !== undefined) throw new Error(behaviour.throws);
	},
	isDone: () => {
		if (behaviour.verifyThrows === true) throw new Error('git unavailable');
		return behaviour.doneAnyway === true;
	},
	remedy: `remove ${label} by hand`,
});

describe('runCleanupSteps', () => {
	it('runs every step even when an earlier one fails', () => {
		const calls: string[] = [];
		const outcome = runCleanupSteps([
			step(
				'remote branch',
				{ throws: 'push failed\nmore detail' },
				calls,
			),
			step('worktree', {}, calls),
			step('local branch', {}, calls),
		]);
		expect(calls).toEqual(['remote branch', 'worktree', 'local branch']);
		expect(outcome.done).toEqual([
			'removed worktree.',
			'removed local branch.',
		]);
		expect(outcome.remaining).toEqual([
			{
				label: 'remote branch',
				reason: 'push failed',
				remedy: 'remove remote branch by hand',
			},
		]);
	});

	it('counts a step that threw as done when git shows its effect in place', () => {
		// A delete that removed the remote branch and then failed to update
		// the local remote-tracking ref exits non-zero.
		const outcome = runCleanupSteps([
			step(
				'remote branch',
				{ throws: 'cannot lock ref', doneAnyway: true },
				[],
			),
		]);
		expect(outcome.done).toEqual(['removed remote branch.']);
		expect(outcome.remaining).toEqual([]);
	});

	it('reports a step as remaining when its effect cannot be verified', () => {
		const outcome = runCleanupSteps([
			step('worktree', { throws: 'busy', verifyThrows: true }, []),
		]);
		expect(outcome.remaining.map((r) => r.label)).toEqual(['worktree']);
	});
});

describe('describeCleanup', () => {
	it('names what was removed, what is left, and the command that finishes it', () => {
		expect(
			describeCleanup({
				done: ['removed the clean worktree /w.'],
				remaining: [
					{
						label: 'the local work branch wip/x',
						reason: 'checked out',
						remedy: 'git branch -D wip/x',
					},
				],
			}),
		).toEqual([
			'✓ forge:publish — removed the clean worktree /w.',
			'! forge:publish — could not remove the local work branch wip/x: checked out',
			'  next-action: git branch -D wip/x',
		]);
	});
});
