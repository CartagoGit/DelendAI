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
	REHEARSAL_AWAIT_CAP_SECONDS,
	REHEARSAL_POLL_MS,
	REHEARSAL_SECRET_SHAPES,
	REHEARSAL_STALE_AFTER_MS,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalClock,
	IRehearsalForge,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';
import { runBranchRoot, runLabelPrefix } from './rehearsal-names.helper';
import { openRuns } from './rehearsal-wait.helper';

/** A run id carries its start: `rYYYYMMDD-HHMMSS`, in UTC. */
const DATE_END = 10;
const TIME_START = 11;
const TIME_END = 19;
export const newRunId = (now: number): string => {
	const iso = new Date(now).toISOString();
	return `r${iso.slice(0, DATE_END).replaceAll('-', '')}-${iso.slice(TIME_START, TIME_END).replaceAll(':', '')}`;
};

/** When a run id says its run started, or `undefined` for a name that is not one. */
export const runStartOf = (runId: string): number | undefined => {
	const match = /^r(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/u.exec(runId);
	if (match === null) return undefined;
	const [, y, mo, d, h, mi, s] = match;
	return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
};

/** A workflow run the forge has accepted but no runner has taken: nothing in it has read the branch. */
const NOT_STARTED = new Set(['queued', 'waiting', 'pending', 'requested']);

/**
 * Ends the workflow runs on `branches` before they are deleted: a run still
 * queued is cancelled (it would start after the branch is gone and fail on
 * the 404), one in progress is waited for, bounded by the await cap. Returns
 * the runs still open at the cap.
 */
const settleRuns = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branches: readonly string[];
}): Promise<readonly IRehearsalRun[]> => {
	const { forge, clock } = input;
	const openOn = async (): Promise<IRehearsalRun[]> => {
		const open: IRehearsalRun[] = [];
		for (const branch of input.branches)
			open.push(...openRuns(await forge.runs(branch)));
		return open;
	};
	const deadline = clock.now() + REHEARSAL_AWAIT_CAP_SECONDS * 1000;
	for (let open = await openOn(); ; open = await openOn()) {
		for (const run of open)
			if (NOT_STARTED.has(run.status)) await forge.cancelRun(run.id);
		const running = open.filter((run) => !NOT_STARTED.has(run.status));
		if (running.length === 0 && open.length === 0) return [];
		if (clock.now() >= deadline) return running;
		await clock.wait(REHEARSAL_POLL_MS);
	}
};

/** Removes everything one run created; returns what is still on the forge after. */
export const cleanRun = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branchPrefix: string;
	readonly runId: string;
}): Promise<readonly string[]> => {
	const { forge } = input;
	const root = runBranchRoot(input.branchPrefix, input.runId);
	const branches = await forge.listBranches(root);
	// No branch is deleted while a workflow run for it is queued or in progress.
	const unsettled = await settleRuns({
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
	return [
		...unsettled.map(
			(run) =>
				`run ${String(run.id)} (${run.workflow}) still in progress`,
		),
		...(await forge.listBranches(root)).map((branch) => `branch ${branch}`),
		...(await forge.labels(runLabelPrefix(input.runId))).map(
			(label) => `label ${label}`,
		),
	];
};

/**
 * Sweeps every run under the prefix that started before `now - olderThanMs`
 * (the stale age unless told). The rehearsal workflow runs one at a time, so
 * its own final step sweeps with 0: nothing else can be alive.
 */
export const sweepStaleRuns = async (input: {
	readonly forge: IRehearsalForge;
	readonly clock: IRehearsalClock;
	readonly branchPrefix: string;
	readonly now: number;
	readonly olderThanMs?: number;
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
		if (started !== undefined && input.now - started < staleAfter) continue;
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
