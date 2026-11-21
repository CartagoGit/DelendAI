/**
 * rehearsal-idle.helper.ts — when the integrator is idle and how the harness
 * wakes it: it reads the forge for work in flight, and, once idle long
 * enough, closes and reopens a pull request (a counted manual step).
 */
import { REHEARSAL_UNSTARTED_AFTER_SECONDS } from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
	IScenarioState,
} from '../contracts/interfaces/rehearsal.interface';

import { openRuns } from './rehearsal-wait.helper';

const isoOf = (clock: IRehearsalRunContext['clock']): string =>
	new Date(clock.now()).toISOString();

/** The pull request `number` as the forge says it now, read fresh. */
const pullNow = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	number: number,
): Promise<IRehearsalPullState | undefined> =>
	(await ctx.forge.pulls(state.integration)).find(
		(pull) => pull.number === number,
	);

/**
 * Close a pull request and reopen it: the events the integrator wakes on,
 * the ones its own bring-forward makes. Converting to draft is refused to the
 * integrator's App (it never succeeded in a logged run), so it is not used.
 * Only a pull request that is open when read is woken: a merged or closed one
 * cannot be reopened and its wait ends by itself. A close or reopen that fails
 * because the pull request merged in between is that same case, not an error.
 */
export const wake = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	keys: readonly string[],
): Promise<void> => {
	for (const key of keys) {
		const number = state.numbers.get(key);
		if (number === undefined) continue;
		if ((await pullNow(ctx, state, number))?.state !== 'open') continue;
		try {
			await ctx.forge.closePull(number);
			await ctx.forge.reopenPull(number);
		} catch (error) {
			if ((await pullNow(ctx, state, number))?.mergedAt !== undefined)
				continue;
			throw error;
		}
		state.manualSteps.push(
			`woke the integrator for ${key} (#${String(number)}) at ${isoOf(ctx.clock)}`,
		);
	}
};

/**
 * Whether a run counts as work in flight: not one the forge listed as queued
 * and never enqueued (no jobs after the unstarted age), which no one is
 * running and would otherwise keep the system from ever being idle.
 */
const isWorking = async (
	ctx: IRehearsalRunContext,
	run: IRehearsalRun,
): Promise<boolean> =>
	!(
		run.status === 'queued' &&
		ctx.clock.now() - Date.parse(run.createdAt) >=
			REHEARSAL_UNSTARTED_AFTER_SECONDS * 1000 &&
		(await ctx.forge.jobCount(run.id)) === 0
	);

/** The first workflow run on the scenario's integration branch or its pull requests' heads that is queued or in progress. */
export const workingRun = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
): Promise<IRehearsalRun | undefined> => {
	const heads = new Set([
		state.integration,
		...(await ctx.forge.pulls(state.integration)).map((pull) => pull.head),
	]);
	for (const head of heads)
		for (const run of openRuns(await ctx.forge.runs(head)))
			if (await isWorking(ctx, run)) return run;
	return undefined;
};

/** Whether any workflow run on the scenario's integration branch or its pull requests' heads is queued or in progress. */
export const somethingRuns = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
): Promise<boolean> => (await workingRun(ctx, state)) !== undefined;
