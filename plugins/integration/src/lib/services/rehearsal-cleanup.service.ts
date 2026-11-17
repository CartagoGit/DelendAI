/**
 * rehearsal-cleanup.service.ts — a rehearsal leaves nothing behind.
 *
 * At the end of a run every pull request whose head or base lies under the
 * run's branch root is closed, every branch under it is deleted, every label
 * with the run's prefix is removed, and
 * the forge is read again: anything still there is a leftover and fails
 * the run. At a run's start, leftovers of runs older than the stale age are
 * swept the same way, so a run that died is cleaned by the next one.
 *
 * The secret scan reads every log of every run the rehearsal started.
 */
import {
	REHEARSAL_CLEANUP_WAIT_SECONDS,
	REHEARSAL_POLL_MS,
	REHEARSAL_SECRET_SHAPES,
	REHEARSAL_STALE_AFTER_MS,
} from '../contracts/constants/rehearsal.constant';
import type {
	ICleanRunResult,
	IUnstartedRun,
} from '../contracts/interfaces/rehearsal-evidence.interface';
import type {
	IRehearsalClock,
	IRehearsalForge,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';
import { runBranchRoot, runLabelPrefix } from './rehearsal-names.helper';
import { unstartedOf } from './rehearsal-unstarted.helper';
import { openRuns } from './rehearsal-wait.helper';

/** A run id carries its start, `rYYYYMMDD-HHMMSS` in UTC, and the group it plays when it plays one: `-g<n>`. */
const DATE_END = 10;
const TIME_START = 11;
const TIME_END = 19;
export const newRunId = (now: number, group?: number): string => {
	const iso = new Date(now).toISOString();
	return `r${iso.slice(0, DATE_END).replaceAll('-', '')}-${iso.slice(TIME_START, TIME_END).replaceAll(':', '')}${group === undefined ? '' : groupSuffix(group)}`;
};

const groupSuffix = (group: number): string => `-g${String(group)}`;

/** When a run id says its run started, or `undefined` for a name that is not one. */
export const runStartOf = (runId: string): number | undefined => {
	const match =
		/^r(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-g\d+)?$/u.exec(runId);
	if (match === null) return undefined;
	const [, y, mo, d, h, mi, s] = match;
	return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
};

/** A workflow run the forge has accepted but no runner has taken: nothing in it has read the branch. */
const NOT_STARTED = new Set(['queued', 'waiting', 'pending', 'requested']);

/**
 * Ends the workflow runs on `branches` before they are deleted: a run still
 * queued is cancelled (it would start after the branch is gone and fail on
 * the 404), one in progress is waited for, bounded by the cleanup cap. Returns
 * the runs still in progress at the cap, and the runs the forge listed but
 * never enqueued, which cannot be cancelled.
 */
const settleRuns = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branches: readonly string[];
}): Promise<{
	readonly running: readonly IRehearsalRun[];
	readonly unstarted: readonly IUnstartedRun[];
}> => {
	const { forge, clock } = input;
	const unstarted = new Map<number, IUnstartedRun>();
	const read = async (): Promise<IRehearsalRun[]> => {
		const all: IRehearsalRun[] = [];
		for (const branch of input.branches)
			all.push(...(await forge.runs(branch)));
		return all;
	};
	const deadline = clock.now() + REHEARSAL_CLEANUP_WAIT_SECONDS * 1000;
	for (let all = await read(); ; all = await read()) {
		const open = openRuns(all).filter((run) => !unstarted.has(run.id));
		for (const run of open)
			if (
				NOT_STARTED.has(run.status) &&
				(await forge.cancelRun(run.id)) === 'unstarted'
			)
				unstarted.set(run.id, unstartedOf(run, all));
		const waiting = open.filter((run) => !unstarted.has(run.id));
		const running = waiting.filter((run) => !NOT_STARTED.has(run.status));
		if (waiting.length === 0 || clock.now() >= deadline)
			return { running, unstarted: [...unstarted.values()] };
		await clock.wait(REHEARSAL_POLL_MS);
	}
};

/** Removes everything one run created; returns what is still on the forge after. */
export const cleanRun = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branchPrefix: string;
	readonly runId: string;
}): Promise<ICleanRunResult> => {
	const { forge } = input;
	const root = runBranchRoot(input.branchPrefix, input.runId);
	const branches = await forge.listBranches(root);
	// No branch is deleted while a workflow run for it is queued or in progress.
	const settled = await settleRuns({
		forge,
		clock: input.clock,
		branches,
	});
	const integrations = branches.filter((branch) =>
		branch.endsWith('-integration'),
	);
	const owned = async (): Promise<readonly number[]> => {
		const numbers: number[] = [];
		for (const base of integrations)
			for (const pull of await forge.pulls(base))
				if (pull.state === 'open') numbers.push(pull.number);
		return numbers;
	};
	for (const number of await owned()) await forge.closePull(number);
	for (const branch of branches) await forge.deleteBranch(branch);
	for (const label of await forge.labels(runLabelPrefix(input.runId)))
		await forge.deleteLabel(label);
	return {
		leftovers: [
			...settled.running.map(
				(run) =>
					`run ${String(run.id)} (${run.workflow}) still in progress`,
			),
			...(await forge.listBranches(root)).map(
				(branch) => `branch ${branch}`,
			),
			...(await forge.labels(runLabelPrefix(input.runId))).map(
				(label) => `label ${label}`,
			),
		],
		unstarted: settled.unstarted,
	};
};

/**
 * Sweeps every run under the prefix that started before `now - olderThanMs`
 * (the stale age unless told), and the runs of group `ownGroup` whatever
 * their age: the groups of one rehearsal play at once, so a group's final
 * step sweeps its own root and the stale ones, never a sibling's. With no
 * group the rehearsal is alone and its final step sweeps with 0.
 */
export const sweepStaleRuns = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branchPrefix: string;
	readonly now: number;
	readonly olderThanMs?: number;
	readonly ownGroup?: number;
}): Promise<readonly string[]> => {
	const staleAfter = input.olderThanMs ?? REHEARSAL_STALE_AFTER_MS;
	const runs = new Set(
		(await input.forge.listBranches(input.branchPrefix))
			.map(
				(branch) =>
					branch.slice(input.branchPrefix.length).split('/')[0],
			)
			.filter((id): id is string => id !== undefined && id !== ''),
	);
	const swept: string[] = [];
	for (const runId of runs) {
		const started = runStartOf(runId);
		const own =
			input.ownGroup !== undefined &&
			runId.endsWith(groupSuffix(input.ownGroup));
		if (!own && started !== undefined && input.now - started < staleAfter)
			continue;
		await cleanRun({
			forge: input.forge,
			clock: input.clock,
			branchPrefix: input.branchPrefix,
			runId,
		});
		swept.push(runId);
	}
	return swept;
};

/** Lines of `log` that carry a token shape or one of `secrets`, with the run they came from. */
export const secretHitsIn = (
	run: Pick<IRehearsalRun, 'id' | 'workflow'>,
	log: string,
	secrets: readonly string[] = [],
): readonly string[] =>
	log
		.split('\n')
		.flatMap((line, index) =>
			REHEARSAL_SECRET_SHAPES.some((shape) => shape.test(line)) ||
			secrets.some(
				(secret) => secret.length >= 8 && line.includes(secret),
			)
				? [
						`${run.workflow} run ${String(run.id)} line ${String(index + 1)}`,
					]
				: [],
		);
