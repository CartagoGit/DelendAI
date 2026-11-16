/**
 * rehearsal-unstarted.helper.ts — a workflow run the forge lists as queued
 * but never enqueued. It has no jobs and no log and cannot be cancelled
 * ("has not been queued yet"); the forge replaced it by a newer run, which
 * ran, so no wake is lost — unless nothing is newer.
 */
import type { IUnstartedRun } from '../contracts/interfaces/rehearsal-evidence.interface';
import type { IRehearsalRun } from '../contracts/interfaces/rehearsal.interface';

/** Whether `run` is the last created of its workflow on its branch among `runs`. */
export const isNewestOfGroup = (
	run: IRehearsalRun,
	runs: readonly IRehearsalRun[],
): boolean =>
	runs.every(
		(other) =>
			other.id === run.id ||
			other.workflow !== run.workflow ||
			other.headBranch !== run.headBranch ||
			other.createdAt < run.createdAt ||
			(other.createdAt === run.createdAt && other.id < run.id),
	);

/** `run` as the unstarted run it is, judged against every run seen on its branch. */
export const unstartedOf = (
	run: IRehearsalRun,
	runs: readonly IRehearsalRun[],
): IUnstartedRun => ({
	id: run.id,
	workflow: run.workflow,
	branch: run.headBranch,
	newest: isNewestOfGroup(run, runs),
});

/** The unstarted runs once each id is listed once, the newest judgement kept. */
export const mergeUnstarted = (
	...lists: readonly (readonly IUnstartedRun[])[]
): readonly IUnstartedRun[] => [
	...new Map(lists.flat().map((one) => [one.id, one] as const)).values(),
];
