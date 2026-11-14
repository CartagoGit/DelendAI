/**
 * rehearsal-run.service.ts — plays one scenario of the pull request flow on
 * the real forge and reads back what happened.
 *
 * Each scenario gets its own integration branch under the run's rehearsal
 * namespace, made from the tip with one setup commit (the integrator, the
 * fast CI and the policy, rendered for that branch). Its synthetic pull
 * requests write only under `rehearsal/`. The harness acts only as the
 * author or the environment would; when the integrator does not act, a
 * wake is taken and counted as a manual step. Nothing here judges: the
 * report does, from the evidence.
 */
import type {
	IRehearsalClock,
	IRehearsalEvidence,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
	IRehearsalScenario,
	IScenarioState,
} from '../contracts/interfaces/rehearsal.interface';

import {
	REHEARSAL_POLL_MS,
	REHEARSAL_SETTLE_SECONDS,
} from '../contracts/constants/rehearsal.constant';
import { scenarioIntegration } from './rehearsal-names.helper';
import { runStep } from './rehearsal-step.service';

const isoOf = (clock: IRehearsalClock): string =>
	new Date(clock.now()).toISOString();

const runsOf = async (
	ctx: IRehearsalRunContext,
	heads: ReadonlySet<string>,
): Promise<IRehearsalRun[]> => {
	const runs: IRehearsalRun[] = [];
	for (const head of heads) runs.push(...(await ctx.forge.runs(head)));
	return runs;
};

const missingPush = (
	runs: readonly IRehearsalRun[],
	tips: readonly string[],
): boolean =>
	tips
		.slice(1)
		.some(
			(sha) =>
				!runs.some(
					(run) => run.event === 'push' && run.headSha === sha,
				),
		);

/**
 * The runs of `heads`, read again until every merged tip has its push run:
 * the forge lists a tip's runs some time after the merge. Bounded: what is
 * still missing at the deadline is evidence of a run that never started.
 */
const settledRuns = async (
	ctx: IRehearsalRunContext,
	heads: ReadonlySet<string>,
	tips: readonly string[],
): Promise<IRehearsalRun[]> => {
	const reads = Math.ceil(
		(REHEARSAL_SETTLE_SECONDS * 1000) / REHEARSAL_POLL_MS,
	);
	let runs = await runsOf(ctx, heads);
	for (let read = 1; read < reads && missingPush(runs, tips); read += 1) {
		await ctx.clock.wait(REHEARSAL_POLL_MS);
		runs = await runsOf(ctx, heads);
	}
	return runs;
};

/** Everything the forge holds about the scenario once it ran. */
const collect = async (
	ctx: IRehearsalRunContext,
	scenario: IRehearsalScenario,
	state: IScenarioState,
	startedAt: string,
): Promise<IRehearsalEvidence> => {
	const all = await ctx.forge.pulls(state.integration);
	const pulls: Record<string, IRehearsalPullState> = {};
	const events: Record<string, readonly IRehearsalPullEvent[]> = {};
	for (const [key, number] of [
		...state.numbers,
		...[...state.tokenPulls].map(
			([key, number]) => [`${key}:token-open`, number] as const,
		),
	]) {
		const pull = all.find((candidate) => candidate.number === number);
		if (pull === undefined) continue;
		pulls[key] = pull;
		events[key] = await ctx.forge.pullEvents(number);
	}
	const heads = new Set([
		state.integration,
		...Object.values(pulls).map((pull) => pull.head),
		...all
			.filter((pull) => !Object.values(pulls).includes(pull))
			.map((pull) => pull.head),
	]);
	const tips = [
		...(await ctx.forge.history(state.integration, state.setupSha)),
	].reverse();
	const runs = await settledRuns(ctx, heads, tips);
	return {
		scenario: scenario.id,
		integration: state.integration,
		pulls,
		events,
		runs,
		tips,
		manualSteps: state.manualSteps,
		tokenHeads: Object.fromEntries(state.tokenHeads),
		tokenPulls: Object.fromEntries(state.tokenPulls),
		startedAt,
		finishedAt: isoOf(ctx.clock),
		failures: state.failures,
	};
};

/** Plays one scenario on the forge and returns its evidence; never throws on a forge refusal. */
export const runScenario = async (
	ctx: IRehearsalRunContext,
	scenario: IRehearsalScenario,
): Promise<IRehearsalEvidence> => {
	const startedAt = isoOf(ctx.clock);
	const integration = scenarioIntegration(
		ctx.branchPrefix,
		ctx.runId,
		scenario.id,
	);
	const state: IScenarioState = {
		integration,
		numbers: new Map(),
		manualSteps: [],
		failures: [],
		tokenHeads: new Map(),
		tokenPulls: new Map(),
		setupSha: ctx.tip,
	};
	try {
		await ctx.forge.createBranch(integration, ctx.tip);
		state.setupSha = await ctx.forge.commit({
			branch: integration,
			parents: [ctx.tip],
			message: `rehearsal(${scenario.id}): set up run ${ctx.runId}`,
			changes: ctx.setup.files(integration),
		});
		for (const step of scenario.steps) {
			ctx.log(`${scenario.id}: ${step.kind}`);
			await runStep(ctx, scenario, state, step);
		}
	} catch (error) {
		state.failures.push(
			`stopped: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return collect(ctx, scenario, state, startedAt);
};
