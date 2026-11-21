/**
 * rehearsal-ready-together.spec.ts — members of one batch become ready in one
 * request, and only while no pass is open on the scenario.
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

const world = (runs: (at: number) => IRehearsalRun[]) => {
	const readies: (readonly number[])[] = [];
	const drafts: boolean[] = [];
	const clock = { at: 0 };
	let opened = 0;
	const forge = fakePartial<IRehearsalForge>({
		createBranch: async () => undefined,
		commit: async () => 'setup',
		tipOf: async () => 'tip',
		openPull: async () => (opened += 1),
		setDraft: async (_n: number, draft: boolean) => void drafts.push(draft),
		readyTogether: async (numbers: readonly number[]) =>
			void readies.push(numbers),
		jobCount: async () => 1,
		pulls: async () => [
			fakePartial<IRehearsalPullState>({ number: 1, head: 'ns/pr-a' }),
		],
		runs: async () => runs(clock.at),
		checkRuns: async () => [],
		pullEvents: async () => [],
		history: async () => [],
	});
	return {
		readies,
		drafts,
		ctx: {
			forge,
			clock: {
				now: () => clock.at,
				wait: async (ms: number) => {
					clock.at += ms;
				},
			},
			setup: { files: async () => [], requiredChecks: ['rehearsal-ci'] },
			runId: 'r',
			tip: 'tip',
			branchPrefix: 'ns/rehearsal/',
			log: () => undefined,
		},
	};
};

const runOf = (id: number, status: string): IRehearsalRun =>
	fakePartial<IRehearsalRun>({ id, headSha: 'h1', status, workflow: 'pass' });

const together = (): IRehearsalScenario => ({
	id: 's',
	title: 's',
	pulls: ['a', 'b'].map((key) => ({
		key,
		declaration: { result: 'success' as const, seconds: 1, sections: [] },
		files: {},
		draft: true,
	})),
	steps: [
		{ kind: 'open', keys: ['a', 'b'] },
		{ kind: 'ready', keys: ['a', 'b'], together: true },
	],
	expect: [],
});

describe('a ready step of one batch', () => {
	it('[<50ms] sends both members in one request, not one by one', async () => {
		const { ctx, readies, drafts } = world(() => [runOf(1, 'completed')]);
		await runScenario(ctx, together());
		expect(readies).toEqual([[1, 2]]);
		expect(drafts).toEqual([]);
	});

	it('[<50ms] sends nothing while a pass is open, and stops at the cap naming the run', async () => {
		const { ctx, readies } = world(() => [runOf(99, 'in_progress')]);
		const evidence = await runScenario(ctx, together());
		expect(readies).toEqual([]);
		expect(JSON.stringify(evidence)).toContain('run 99 still in_progress');
	});

	it('[<50ms] sends the request once the open pass has ended', async () => {
		const { ctx, readies } = world((now) => [
			runOf(5, now < 10_000 ? 'in_progress' : 'completed'),
		]);
		await runScenario(ctx, together());
		expect(readies).toHaveLength(1);
	});
});
