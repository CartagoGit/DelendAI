/**
 * rehearsal-wait.helper.ts — what the forge says about a pull request's own
 * checks while a scenario waits for it. A check is judged as branch
 * protection judges it: by the check runs of the head's commit, for the
 * required names. A workflow run that started no job makes no check run, so
 * its check is absent (pending), never red.
 */
import type {
	IRehearsalCheckRun,
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalRunContext,
	IRehearsalScenario,
	IRehearsalStep,
} from '../contracts/interfaces/rehearsal.interface';
import {
	REHEARSAL_GROUPING,
	REHEARSAL_RUNNING_STATUSES,
} from '../contracts/constants/rehearsal.constant';

const RED = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);

/** The workflow runs that are queued or in progress. */
export const openRuns = (
	runs: readonly IRehearsalRun[],
): readonly IRehearsalRun[] =>
	runs.filter((run) => REHEARSAL_RUNNING_STATUSES.has(run.status));

/** The latest check run of each name, by start time and then by the higher id. */
const latestByName = (
	runs: readonly IRehearsalCheckRun[],
): ReadonlyMap<string, IRehearsalCheckRun> => {
	const newest = new Map<string, IRehearsalCheckRun>();
	for (const run of runs) {
		const held = newest.get(run.name);
		if (
			held === undefined ||
			run.startedAt > held.startedAt ||
			(run.startedAt === held.startedAt && run.id > held.id)
		)
			newest.set(run.name, run);
	}
	return newest;
};

/** The state of the required checks on one commit: whether each finished, and the first that ended red. */
export const requiredCheckState = (
	runs: readonly IRehearsalCheckRun[],
	requiredChecks: readonly string[],
): {
	readonly concluded: boolean;
	readonly red?: IRehearsalCheckRun;
} => {
	const latest = latestByName(runs);
	let concluded = requiredChecks.length > 0;
	for (const name of requiredChecks) {
		const run = latest.get(name);
		if (run === undefined || run.status !== 'completed') {
			concluded = false;
			continue;
		}
		if (run.conclusion !== undefined && RED.has(run.conclusion))
			return { concluded: true, red: run };
	}
	return { concluded };
};

/**
 * Whether a red check on the awaited head ends the wait: not in a scenario
 * that expects a label (a culprit named, a conflict told), where red or a
 * later author update is the flow working.
 */
export const redEndsWait = (
	scenario: Pick<IRehearsalScenario, 'expect'>,
): boolean => !scenario.expect.some((one) => one.kind === 'labelled');

/** The state of the awaited pull requests' required checks: whether all concluded, and the first red one. */
export const awaitedChecks = async (
	forge: Pick<IRehearsalForge, 'checkRuns'>,
	pulls: ReadonlyMap<string, IRehearsalPullState>,
	keys: readonly string[],
	requiredChecks: readonly string[],
): Promise<{
	readonly concluded: boolean;
	readonly red?: IRehearsalCheckRun & { readonly key: string };
}> => {
	let concluded = keys.length > 0;
	for (const key of keys) {
		const pull = pulls.get(key);
		if (pull === undefined) {
			concluded = false;
			continue;
		}
		const state = requiredCheckState(
			await forge.checkRuns(pull.headSha),
			requiredChecks,
		);
		if (state.red !== undefined)
			return { concluded: true, red: { ...state.red, key } };
		if (!state.concluded) concluded = false;
	}
	return { concluded };
};

/**
 * How long the step may idle before it fails. A batch's CI in real mode runs
 * the project's whole pipeline after the awaited pull requests' own checks
 * ended, so a wait for a label that depends on it takes at least the mode's
 * cap, which `allowedWait` still bounds.
 */
export const idleLimit = (
	ctx: IRehearsalRunContext,
	step: Extract<IRehearsalStep, { kind: 'await' }>,
): number =>
	ctx.mode === 'real' && step.until === 'labelled'
		? Math.max(step.seconds, REHEARSAL_GROUPING.real.awaitCapSeconds)
		: step.seconds;
