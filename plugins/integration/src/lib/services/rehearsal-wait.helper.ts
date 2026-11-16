/**
 * rehearsal-wait.helper.ts — what the forge says about a pull request's own
 * checks while a scenario waits for it: whether they concluded, and whether
 * one ended red on the head that is there now.
 */
import type {
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalScenario,
} from '../contracts/interfaces/rehearsal.interface';
import { REHEARSAL_RUNNING_STATUSES } from '../contracts/constants/rehearsal.constant';

/** Workflows that are the integrator's own, not a check the pull request must pass. */
const INTEGRATOR_WORKFLOWS: ReadonlySet<string> = new Set([
	'land',
	'land-signal',
]);
const RED = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * The newest run of each workflow on each commit, by `createdAt` and then by
 * the higher id. An older run of the same workflow on the same commit is
 * superseded: the forge judges the latest, so no wait, scan or gate reads an
 * older one.
 */
export const latestRuns = (
	runs: readonly IRehearsalRun[],
): readonly IRehearsalRun[] => {
	const newest = new Map<string, IRehearsalRun>();
	for (const run of runs) {
		const key = `${run.headSha}\n${run.workflow}`;
		const held = newest.get(key);
		if (
			held === undefined ||
			run.createdAt > held.createdAt ||
			(run.createdAt === held.createdAt && run.id > held.id)
		)
			newest.set(key, run);
	}
	return [...newest.values()];
};

/** The latest runs that are queued or in progress. */
export const openRuns = (
	runs: readonly IRehearsalRun[],
): readonly IRehearsalRun[] =>
	latestRuns(runs).filter((run) =>
		REHEARSAL_RUNNING_STATUSES.has(run.status),
	);

/** The latest run of each check the head's own pull request started, on the head's current commit. */
export const checkRuns = (
	runs: readonly IRehearsalRun[],
	pull: Pick<IRehearsalPullState, 'headSha'>,
): readonly IRehearsalRun[] =>
	latestRuns(
		runs.filter(
			(run) =>
				run.headSha === pull.headSha &&
				run.event === 'pull_request' &&
				!INTEGRATOR_WORKFLOWS.has(run.workflow),
		),
	);

/** Whether every check run of the head's current commit has finished, and at least one exists. */
export const checksConcluded = (
	runs: readonly IRehearsalRun[],
	pull: Pick<IRehearsalPullState, 'headSha'>,
): boolean => {
	const own = checkRuns(runs, pull);
	return own.length > 0 && own.every((run) => run.status === 'completed');
};

/** The run of a check that ended red on the head's current commit, if any. */
export const redCheck = (
	runs: readonly IRehearsalRun[],
	pull: Pick<IRehearsalPullState, 'headSha'>,
): IRehearsalRun | undefined =>
	checkRuns(runs, pull).find(
		(run) =>
			run.status === 'completed' &&
			run.conclusion !== undefined &&
			RED.has(run.conclusion),
	);

/**
 * Whether a red check on the awaited head ends the wait: not in a scenario
 * that expects a label (a culprit named, a conflict told), where red or a
 * later author update is the flow working.
 */
export const redEndsWait = (
	scenario: Pick<IRehearsalScenario, 'expect'>,
): boolean => !scenario.expect.some((one) => one.kind === 'labelled');

/** The state of the awaited pull requests' own checks: whether all concluded, and the first red one. */
export const awaitedChecks = async (
	forge: Pick<IRehearsalForge, 'runs'>,
	pulls: ReadonlyMap<string, IRehearsalPullState>,
	keys: readonly string[],
): Promise<{
	readonly concluded: boolean;
	readonly red?: IRehearsalRun & { readonly key: string };
}> => {
	let concluded = keys.length > 0;
	for (const key of keys) {
		const pull = pulls.get(key);
		if (pull === undefined) {
			concluded = false;
			continue;
		}
		const runs = await forge.runs(pull.head);
		const red = redCheck(runs, pull);
		if (red !== undefined) return { concluded: true, red: { ...red, key } };
		if (!checksConcluded(runs, pull)) concluded = false;
	}
	return { concluded };
};
