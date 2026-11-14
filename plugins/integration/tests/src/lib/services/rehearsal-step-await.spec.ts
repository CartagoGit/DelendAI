/**
 * rehearsal-step-await.spec.ts — what an await step waits for on the forge:
 * a label, a finished check, a pull request that is not there yet, and that
 * it wakes the integrator only when nothing is running.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalScenario,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { runScenario } from '../../../../src/lib/services/rehearsal-run.service';

const pullOf = (over: Partial<IRehearsalPullState>): IRehearsalPullState =>
	fakePartial<IRehearsalPullState>({
		number: 1,
		head: 'ns/pr-a',
		headSha: 'h1',
		state: 'open',
		draft: false,
		labels: [],
		...over,
	});

const runOf = (status: string): IRehearsalRun =>
	fakePartial<IRehearsalRun>({ headSha: 'h1', status, workflow: 'ci' });

const world = (pull: Partial<IRehearsalPullState>, runs: IRehearsalRun[]) => {
	const drafts: boolean[] = [];
	const clock = { at: 0 };
	const forge = fakePartial<IRehearsalForge>({
		createBranch: async () => undefined,
		commit: async () => 'setup',
		tipOf: async () => 'tip',
		openPull: async () => 1,
		setDraft: async (_n: number, draft: boolean) => void drafts.push(draft),
		pulls: async () => [pullOf(pull)],
		runs: async () => runs,
		pullEvents: async () => [],
		history: async () => [],
	});
	return {
		drafts,
		ctx: {
			forge,
			clock: {
				now: () => clock.at,
				wait: async (ms: number) => {
					clock.at += ms;
				},
			},
			setup: { files: () => [] },
			runId: 'r',
			tip: 'tip',
			branchPrefix: 'ns/rehearsal/',
			log: () => undefined,
		},
	};
};

const scenario = (
	until: 'labelled' | 'checked' | 'merged',
	keys: string[],
	wakeAfterSeconds?: number,
): IRehearsalScenario => ({
	id: 's',
	title: 's',
	pulls: [
		{
			key: 'a',
			declaration: { result: 'success', seconds: 1, sections: [] },
			files: {},
			draft: true,
		},
	],
	steps: [
		{ kind: 'open', keys: ['a'] },
		{
			kind: 'await',
			until,
			keys,
			seconds: 60,
			...(wakeAfterSeconds === undefined ? {} : { wakeAfterSeconds }),
		},
	],
	expect: [],
});

describe('an await step', () => {
	it('[<50ms] is met by a needs-update or a culprit label', async () => {
		for (const label of ['p:needs-update', 'p:culprit']) {
			const { ctx } = world({ labels: [label] }, []);
			const evidence = await runScenario(
				ctx,
				scenario('labelled', ['a']),
			);
			expect(evidence.failures).toEqual([]);
		}
	});

	it('[<50ms] is not met by a label that says neither', async () => {
		const { ctx } = world({ labels: ['p:other'] }, []);
		const evidence = await runScenario(ctx, scenario('labelled', ['a']));
		expect(evidence.failures[0]).toContain('labelled not reached');
	});

	it('[<50ms] is met by a completed run on the head, and not by one on another sha', async () => {
		const done = world({}, [runOf('completed')]);
		expect(
			(await runScenario(done.ctx, scenario('checked', ['a']))).failures,
		).toEqual([]);
		const other = world({}, [
			fakePartial<IRehearsalRun>({ headSha: 'old', status: 'completed' }),
		]);
		expect(
			(await runScenario(other.ctx, scenario('checked', ['a'])))
				.failures[0],
		).toContain('checked not reached');
	});

	it('[<50ms] waits on a pull request that is not there, and never wakes for it', async () => {
		const { ctx, drafts } = world({}, []);
		const evidence = await runScenario(
			ctx,
			scenario('merged', ['ghost'], 10),
		);
		expect(evidence.failures[0]).toContain('ghost');
		expect(drafts).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<50ms] wakes an idle integrator once its time is up, and counts the step', async () => {
		const { ctx, drafts } = world({}, [runOf('completed')]);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(drafts.slice(0, 2)).toEqual([true, false]);
		expect(evidence.manualSteps.length).toBeGreaterThan(0);
	});

	it('[<50ms] does not wake while a run is queued', async () => {
		const { ctx, drafts } = world({}, [runOf('queued')]);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(drafts).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});
});
