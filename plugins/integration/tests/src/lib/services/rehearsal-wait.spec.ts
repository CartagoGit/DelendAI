import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
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

/** A forge with the one pull request open and the given runs on every branch; a clock that moves only when waited on. */
const world = (runs: (branch: string) => readonly IRehearsalRun[]) => {
	let now = 0;
	const ctx = fakePartial<IRehearsalRunContext>({
		forge: fakePartial<IRehearsalRunContext['forge']>({
			pulls: async () => [pull],
			runs: async (branch: string) => runs(branch),
		}),
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
		const { ctx, state, elapsed } = world((branch) =>
			branch === 'h' ? [run({ id: 99, conclusion: 'failure' })] : [],
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures).toEqual([
			'merged not reachable for a: CI ended failure on its head (run 99)',
		]);
		expect(elapsed()).toBe(0);
	});

	it('[<50ms] keeps waiting on a red check in a scenario that expects a label', async () => {
		const { ctx, state } = world((branch) =>
			branch === 'h' ? [run({ conclusion: 'failure' })] : [],
		);
		await runStep(ctx, scenario(true), state, merged);
		expect(state.failures[0]).toContain(
			`merged not reached in ${String(BUDGET_SECONDS)} s`,
		);
	});

	it('[<50ms] ignores a red run of an older commit and the integrator’s own runs', async () => {
		const { ctx, state } = world((branch) =>
			branch === 'h'
				? [
						run({ headSha: 'old', conclusion: 'failure' }),
						run({ workflow: 'land-signal', conclusion: 'failure' }),
					]
				: [],
		);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures[0]).toContain('merged not reached');
	});

	it('[<50ms] counts wall time once the checks concluded, however busy the integrator is', async () => {
		const { ctx, state, elapsed } = world((branch) => [
			run({ conclusion: 'success' }),
			run({
				id: 2,
				workflow: 'land',
				event: 'workflow_dispatch',
				status: 'in_progress',
				headSha: branch,
			}),
		]);
		await runStep(ctx, scenario(false), state, merged);
		expect(state.failures[0]).toContain('merged not reached');
		expect(elapsed()).toBeLessThanOrEqual(BUDGET_SECONDS * 1000 + POLL_MS);
	});
});
