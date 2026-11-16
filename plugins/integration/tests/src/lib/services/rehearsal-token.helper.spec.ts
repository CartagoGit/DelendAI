/**
 * rehearsal-token.helper.spec.ts — what the harness takes as "the workflow
 * token wrote this head": the concluded token run and the commit it pushed,
 * read from the branch's history, not from whichever head the pull has now.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { tokenPush } from '../../../../src/lib/services/rehearsal-token.helper';

const pull = fakePartial<IRehearsalPullState>({
	head: 'ns/pr-a',
	headSha: 'h1',
});

const run = (status: string, conclusion = 'success'): IRehearsalRun =>
	fakePartial<IRehearsalRun>({
		id: 7,
		status,
		conclusion,
		workflow: 'rehearsal-token',
		event: 'pull_request',
		createdAt: '2026-01-01T00:00:00Z',
	});

const contextOf = (
	runs: (at: number) => IRehearsalRun[],
	history: readonly string[],
): IRehearsalRunContext => {
	const clock = { at: 0 };
	return fakePartial<IRehearsalRunContext>({
		forge: fakePartial<IRehearsalForge>({
			runs: async () => runs(clock.at),
			history: async () => history,
		}),
		clock: {
			now: () => clock.at,
			wait: async (ms: number) => {
				clock.at += ms;
			},
		},
	});
};

describe('tokenPush', () => {
	it('[<50ms] names the commit the token run pushed although a later commit moved the head', async () => {
		const ctx = contextOf(
			(at) => [run(at >= 30_000 ? 'completed' : 'in_progress')],
			['h3', 'h2', 'h1'],
		);
		expect(await tokenPush(ctx, pull)).toEqual({ sha: 'h2' });
	});

	it('[<50ms] fails when the run concluded without a commit, or red', async () => {
		expect(
			await tokenPush(
				contextOf(() => [run('completed')], ['h1']),
				pull,
			),
		).toEqual({
			failure:
				'the workflow token pushed nothing to ns/pr-a (run 7 concluded success)',
		});
		expect(
			await tokenPush(
				contextOf(() => [run('completed', 'failure')], ['h2', 'h1']),
				pull,
			),
		).toEqual({ failure: 'run 7 concluded failure' });
	});

	it('[<50ms] stops at the cap naming the run, or saying none started', async () => {
		const stuck = await tokenPush(
			contextOf(() => [run('in_progress')], []),
			pull,
		);
		expect(stuck).toMatchObject({
			failure: expect.stringContaining('run 7 still in_progress after'),
		});
		const none = await tokenPush(
			contextOf(() => [], []),
			pull,
		);
		expect(none).toMatchObject({
			failure: expect.stringContaining('no rehearsal-token run started'),
		});
	});
});
