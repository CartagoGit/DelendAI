import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IRehearsalCheckRun,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
	IRehearsalScenario,
	IScenarioState,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { runStep } from '../../../../src/lib/services/rehearsal-step.service';

const POLL_MS = 15_000;
const BUDGET_SECONDS = 60;

const pull = fakePartial<IRehearsalPullState>({
	number: 7,
	head: 'h',
	headSha: 'sha1',
	labels: [],
	state: 'open',
});

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'CI',
	event: 'pull_request',
	headBranch: 'h',
	headSha: 'sha1',
	status: 'completed',
	actor: 'a',
	createdAt: '',
	updatedAt: '',
	...over,
});

const check = (over: Partial<IRehearsalCheckRun>): IRehearsalCheckRun => ({
	id: 5,
	name: 'rehearsal-ci',
	headSha: 'sha1',
	status: 'completed',
	conclusion: 'success',
	startedAt: '2026-11-16T04:28:33Z',
	...over,
});

/** A forge with the one pull request open, the given workflow runs on every branch and check runs on every commit; a clock that moves only when waited on. */
const world = (
	runs: (branch: string) => readonly IRehearsalRun[],
	checks: (sha: string) => readonly IRehearsalCheckRun[] = () => [],
	pullAt: (now: number) => IRehearsalPullState = () => pull,
) => {
	let now = 0;
	const ctx = fakePartial<IRehearsalRunContext>({
		forge: fakePartial<IRehearsalRunContext['forge']>({
			pulls: async () => [pullAt(now)],
			runs: async (branch: string) => runs(branch),
			checkRuns: async (sha: string) => checks(sha),
		}),
		setup: { files: async () => [], requiredChecks: ['rehearsal-ci'] },
		clock: {
			now: () => now,
			wait: async (ms: number) => {
				now += ms;
			},
		},
		log: () => undefined,
	});
	const state: IScenarioState = {
		integration: 'i',
		numbers: new Map([['a', 7]]),
		manualSteps: [],
		failures: [],
		tokenHeads: new Map(),
		tokenPulls: new Map(),
		notifications: undefined,
		setupSha: 's',
		awaitedMs: 0,
	};
	return { ctx, state, elapsed: () => now };
};

const scenario = (expectLabel: boolean): IRehearsalScenario => ({
	id: 's',
	title: 's',
	pulls: [],
	steps: [],
	expect: expectLabel
		? [{ kind: 'labelled', key: 'a', label: 'needs-update' }]
		: [{ kind: 'merged', keys: ['a'] }],
});

const merged = {
	kind: 'await',
	until: 'merged',
	keys: ['a'],
	seconds: BUDGET_SECONDS,
} as const;

describe('a wait for a merge', () => {
	it('[<50ms] ends at once, naming the check and its run, when the check ended red on the head', async () => {
		const { ctx, state, elapsed } = world(
			() => [],
			(sha) =>
				sha === 'sha1'
					? [check({ id: 99, conclusion: 'failure' })]
					: [],
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures).toEqual([
			'merged not reachable for a: rehearsal-ci ended failure on its head (check run 99)',
		]);
		expect(elapsed()).toBe(0);
	});

	it('[<50ms] keeps waiting on a red check in a scenario that expects a label', async () => {
		const { ctx, state } = world(
			() => [],
			() => [check({ conclusion: 'failure' })],
		);
		await runStep(ctx, scenario(true), state, merged);
		expect(state.failures[0]).toContain(
			`merged not reached in ${String(BUDGET_SECONDS)} s`,
		);
	});

	it('[<50ms] ignores a red check run of an older commit and one that is not required', async () => {
		const { ctx, state } = world(
			() => [],
			(sha) =>
				sha === 'old'
					? [check({ headSha: 'old', conclusion: 'failure' })]
					: [check({ name: 'land-signal', conclusion: 'failure' })],
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures[0]).toContain('merged not reached');
	});

	it('[<50ms] counts wall time once the checks concluded, however busy the integrator is', async () => {
		const { ctx, state, elapsed } = world(
			(branch) => [
				run({
					id: 2,
					workflow: 'land',
					event: 'workflow_dispatch',
					status: 'in_progress',
					headSha: branch,
				}),
			],
			() => [check({})],
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures[0]).toContain('merged not reached');
		expect(elapsed()).toBeLessThanOrEqual(BUDGET_SECONDS * 1000 + POLL_MS);
	});

	it('[<50ms] keeps waiting behind a failed workflow run that started no job, then reports merged', async () => {
		const noJobs = run({ id: 10, conclusion: 'failure' });
		const { ctx, state } = world(
			(branch) => (branch === 'h' ? [noJobs] : []),
			() => [],
			(now) =>
				now >= 30_000
					? fakePartial<IRehearsalPullState>({
							...pull,
							mergedAt: 'done',
						})
					: pull,
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures).toEqual([]);
	});

	it('[<50ms] is not red behind an older failed check run once a newer one of the same name passed', async () => {
		const { ctx, state } = world(
			() => [],
			() => [
				check({
					id: 10,
					conclusion: 'failure',
					startedAt: '2026-11-16T04:28:05Z',
				}),
				check({ id: 11 }),
			],
			(now) =>
				now >= 30_000
					? fakePartial<IRehearsalPullState>({
							...pull,
							mergedAt: 'done',
						})
					: pull,
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures).toEqual([]);
	});
});
