/**
 * rehearsal-idle.helper.spec.ts — the wake acts only on a pull request that
 * is open when read; a merge in between is the wait ending, not an error.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRunContext,
	IScenarioState,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { wake } from '../../../../src/lib/services/rehearsal-idle.helper';

const pullOf = (over: Partial<IRehearsalPullState>): IRehearsalPullState =>
	fakePartial<IRehearsalPullState>({ number: 7, state: 'open', ...over });

const setup = (options: {
	readonly reads: readonly Partial<IRehearsalPullState>[];
	readonly reopenFails?: boolean;
}) => {
	const calls: string[] = [];
	let read = 0;
	const forge = fakePartial<IRehearsalForge>({
		pulls: async () => [
			pullOf(
				options.reads[Math.min(read++, options.reads.length - 1)] ?? {},
			),
		],
		closePull: async () => void calls.push('close'),
		reopenPull: async () => {
			calls.push('reopen');
			if (options.reopenFails)
				throw new Error('PATCH pulls/7 answered 422');
		},
	});
	const ctx = fakePartial<IRehearsalRunContext>({
		forge,
		clock: { now: () => 0, wait: async () => undefined },
	});
	const state = fakePartial<IScenarioState>({
		integration: 'int',
		numbers: new Map([['a', 7]]),
		manualSteps: [],
	});
	return { calls, ctx, state };
};

describe('wake', () => {
	it('[<50ms] closes then reopens an open pull request and counts the step', async () => {
		const { calls, ctx, state } = setup({ reads: [{}] });
		await wake(ctx, state, ['a']);
		expect(calls).toEqual(['close', 'reopen']);
		expect(state.manualSteps).toHaveLength(1);
	});

	it('[<50ms] does not touch a pull request that already merged', async () => {
		const { calls, ctx, state } = setup({
			reads: [{ state: 'closed', mergedAt: '2026-11-16T00:00:00Z' }],
		});
		await wake(ctx, state, ['a']);
		expect(calls).toEqual([]);
		expect(state.manualSteps).toEqual([]);
	});

	it('[<50ms] treats a 422 as reached when the pull request merged in between', async () => {
		const { calls, ctx, state } = setup({
			reads: [{}, { state: 'closed', mergedAt: '2026-11-16T00:00:00Z' }],
			reopenFails: true,
		});
		await wake(ctx, state, ['a']);
		expect(calls).toEqual(['close', 'reopen']);
		expect(state.manualSteps).toEqual([]);
	});

	it('[<50ms] stops with the forge message when the 422 leaves it closed unmerged', async () => {
		const { ctx, state } = setup({
			reads: [{}, { state: 'closed' }],
			reopenFails: true,
		});
		await expect(wake(ctx, state, ['a'])).rejects.toThrow('answered 422');
	});
});
