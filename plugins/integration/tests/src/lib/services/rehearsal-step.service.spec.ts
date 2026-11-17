/**
 * rehearsal-step-await.spec.ts — what an await step waits for on the forge:
 * a label, a finished check, a pull request that is not there yet, and that
 * it wakes the integrator only when nothing is running.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalCheckRun,
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalScenario,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { REHEARSAL_GROUPING } from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { runBranchRoot } from '../../../../src/lib/services/rehearsal-names.helper';
import { judge } from '../../../../src/lib/services/rehearsal-expectation.service';
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

type TOverTime<T> = T | ((at: number) => T);
const at = <T>(value: TOverTime<T>, now: number): T =>
	typeof value === 'function' ? (value as (at: number) => T)(now) : value;

const world = (
	pull: TOverTime<Partial<IRehearsalPullState>>,
	runs: TOverTime<IRehearsalRun[]>,
	checks: TOverTime<IRehearsalCheckRun[]> = [],
	jobs = 1,
) => {
	const drafts: boolean[] = [];
	const wakes: string[] = [];
	let opened = 0;
	const commits: { branch: string; parents: readonly string[] }[] = [];
	const labels: string[] = [];
	const clock = { at: 0 };
	const forge = fakePartial<IRehearsalForge>({
		createBranch: async () => undefined,
		commit: async (input: {
			branch: string;
			parents: readonly string[];
		}) => {
			commits.push(input);
			return 'setup';
		},
		addLabel: async (_n: number, label: string) => void labels.push(label),
		tipOf: async () => 'tip',
		openPull: async () => (opened += 1),
		setDraft: async (_n: number, draft: boolean) => void drafts.push(draft),
		jobCount: async () => jobs,
		closePull: async () => void wakes.push('close'),
		reopenPull: async () => void wakes.push('reopen'),
		pulls: async () => [pullOf(at(pull, clock.at))],
		runs: async () => at(runs, clock.at),
		checkRuns: async () => at(checks, clock.at),
		pullEvents: async () => [],
		history: async () => [],
	});
	return {
		drafts,
		wakes,
		commits,
		labels,
		clock,
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
		const { ctx, wakes } = world({}, []);
		const evidence = await runScenario(
			ctx,
			scenario('merged', ['ghost'], 10),
		);
		expect(evidence.failures[0]).toContain('ghost');
		expect(wakes).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<50ms] wakes an idle integrator once its time is up, and counts the step', async () => {
		const { ctx, wakes } = world({}, [runOf('completed')]);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(wakes.slice(0, 2)).toEqual(['close', 'reopen']);
		expect(evidence.manualSteps.length).toBeGreaterThan(0);
	});

	it('[<50ms] does not wake while a run is queued', async () => {
		const { ctx, wakes } = world({}, [runOf('queued')]);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(wakes).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<50ms] wakes when the only run left is one the forge queued and never enqueued, once it is a minute old', async () => {
		const stuck = {
			...runOf('queued'),
			createdAt: new Date(0).toISOString(),
		};
		const { ctx, wakes } = world({}, [stuck], [], 0);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(wakes.slice(0, 2)).toEqual(['close', 'reopen']);
		expect(evidence.manualSteps.length).toBeGreaterThan(0);
	});

	it('[<50ms] keeps waiting for an old queued run that has jobs: it is working', async () => {
		const slow = {
			...runOf('queued'),
			createdAt: new Date(0).toISOString(),
		};
		const { ctx, wakes } = world({}, [slow], [], 2);
		await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(wakes).toEqual([]);
	});

	it("[<50ms] does not wake while the integrator runs after the head's own checks finished", async () => {
		const { ctx, wakes } = world({}, [
			fakePartial<IRehearsalRun>({
				headSha: 'h1',
				status: 'completed',
				event: 'pull_request',
				workflow: 'CI',
			}),
			fakePartial<IRehearsalRun>({
				headSha: 'h1',
				status: 'queued',
				event: 'push',
				workflow: 'land',
			}),
		]);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(wakes).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<50ms] counts only idle time: runs for 3 minutes, then the merge, passes with no manual step', async () => {
		const minute = 60_000;
		const { ctx } = world(
			(now) => (now >= 3 * minute ? { mergedAt: 'merged' } : {}),
			(now) => [runOf(now < 3 * minute ? 'in_progress' : 'completed')],
		);
		const evidence = await runScenario(ctx, scenario('merged', ['a'], 10));
		expect(evidence.failures).toEqual([]);
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<50ms] keeps waiting behind a failed workflow run that started no job, then sees the merge', async () => {
		const minute = 60_000;
		const startUpFailure = fakePartial<IRehearsalRun>({
			headSha: 'h1',
			status: 'completed',
			conclusion: 'failure',
			event: 'pull_request',
			workflow: 'rehearsal-ci',
		});
		const { ctx } = world(
			(now) => (now >= minute ? { mergedAt: 'merged' } : {}),
			[startUpFailure],
		);
		const evidence = await runScenario(ctx, scenario('merged', ['a']));
		expect(evidence.failures).toEqual([]);
	});

	it('[<50ms] ends at once on a required check run that failed on the head', async () => {
		const failed: IRehearsalCheckRun = {
			id: 9,
			name: 'rehearsal-ci',
			headSha: 'h1',
			status: 'completed',
			conclusion: 'failure',
			startedAt: '2026-11-16T13:35:06Z',
		};
		const { ctx, clock } = world({}, [], [failed]);
		const evidence = await runScenario(ctx, scenario('merged', ['a']));
		expect(evidence.failures).toEqual([
			'merged not reachable for a: rehearsal-ci ended failure on its head (check run 9)',
		]);
		expect(clock.at).toBe(0);
	});

	it('[<50ms] fails once it has been idle for its seconds, whatever ran before', async () => {
		const { ctx } = world({}, (now) => [
			runOf(now < 150_000 ? 'queued' : 'completed'),
		]);
		const evidence = await runScenario(ctx, scenario('merged', ['a']));
		expect(evidence.failures).toEqual(['merged not reached in 60 s for a']);
	});

	it('[<50ms] fails at the cap, naming it, however long something keeps running', async () => {
		const { ctx } = world({}, [runOf('in_progress')]);
		const evidence = await runScenario(ctx, scenario('merged', ['a']));
		expect(evidence.failures).toEqual([
			`merged not reached within the ${String(REHEARSAL_GROUPING.fast.awaitCapSeconds)} s cap for a`,
		]);
	});

	it('[<50ms] shares one wait budget between the waits of a scenario, so a later wait gets what is left', async () => {
		const { ctx } = world({}, [runOf('in_progress')]);
		const two: IRehearsalScenario = {
			...scenario('merged', ['a']),
			steps: [
				{ kind: 'open', keys: ['a'] },
				{ kind: 'await', until: 'merged', keys: ['a'], seconds: 60 },
				{ kind: 'await', until: 'merged', keys: ['a'], seconds: 60 },
			],
		};
		const evidence = await runScenario(
			{ ...ctx, awaitCapSeconds: 100, awaitBudgetSeconds: 150 },
			two,
		);
		expect(evidence.failures).toEqual([
			'merged not reached within the 100 s cap for a',
			'merged not reached within the 45 s left of the 150 s wait budget for a',
		]);
	});
});

const withSteps = (steps: IRehearsalScenario['steps']): IRehearsalScenario => ({
	...scenario('merged', ['a']),
	steps: [{ kind: 'open', keys: ['a'] }, ...steps],
});

describe('the other steps of a scenario', () => {
	it('[<50ms] marks a pull request ready, and moves the integration branch under the run', async () => {
		const { ctx, drafts, commits } = world({}, []);
		await runScenario(
			ctx,
			withSteps([
				{ kind: 'ready', keys: ['a'] },
				{ kind: 'move-integration', key: 'm' },
			]),
		);
		expect(drafts).toEqual([false]);
		expect(commits.at(-1)?.parents).toEqual(['tip']);
	});

	it('[<50ms] has the author merge the integration branch in, or reports a pull request that is not open', async () => {
		const { ctx, commits } = world({}, []);
		const evidence = await runScenario(
			ctx,
			withSteps([
				{ kind: 'author-update', key: 'a', files: {} },
				{ kind: 'author-update', key: 'zz', files: {} },
			]),
		);
		expect(commits.at(-1)?.parents).toEqual(['h1', 'tip']);
		expect(evidence.failures).toEqual(['author-update: zz is not open']);
	});

	it('[<50ms] records the pull request the workflow token opened, or says it opened none', async () => {
		const head = `${runBranchRoot('ns/rehearsal/', 'r')}token-open-1`;
		const opened = await runScenario(
			world((now) => (now >= 30_000 ? { head } : {}), []).ctx,
			withSteps([{ kind: 'token-open', key: 'a' }]),
		);
		expect(opened.failures).toEqual([]);
		const none = await runScenario(
			world({}, []).ctx,
			withSteps([{ kind: 'token-open', key: 'a' }]),
		);
		expect(none.failures[0]).toContain(
			'the workflow token opened no pull request',
		);
	});
});

describe('a receive step', () => {
	const receiving = (): IRehearsalScenario => ({
		...scenario('merged', ['a']),
		steps: [
			{ kind: 'open', keys: ['a'] },
			{ kind: 'receive', keys: ['a'] },
		],
	});

	it('[<50ms] tells a merge that happened while no receiver ran once, and nothing on the second connection', async () => {
		const { ctx } = world({ mergedAt: '2026-11-12T10:05:00Z' }, []);
		const evidence = await runScenario(ctx, receiving());
		expect(evidence.notifications?.map((n) => n.event)).toEqual([
			'pr.merged',
		]);
		expect(evidence.notifications?.[0]?.number).toBe(1);
		expect(judge(evidence, { kind: 'sessions-notified' }).ok).toBe(true);
	});

	it('[<50ms] tells a label once and leaves nothing told when nothing changed', async () => {
		const labelled = world({ labels: ['p:culprit'] }, []);
		const told = await runScenario(labelled.ctx, receiving());
		expect(told.notifications?.map((n) => n.event)).toEqual(['pr.updated']);
		const quiet = world({}, []);
		const none = await runScenario(quiet.ctx, receiving());
		expect(none.notifications).toEqual([]);
	});

	it('[<50ms] tells a pull request closed without merging', async () => {
		const { ctx } = world({ state: 'closed' }, []);
		const evidence = await runScenario(ctx, receiving());
		expect(evidence.notifications?.map((n) => n.event)).toEqual([
			'pr.closed',
		]);
	});
});
