/**
 * rehearsal-unstarted.helper.ts — a workflow run the forge lists as queued
 * but never enqueued. It has no jobs and no log and cannot be cancelled
 * ("has not been queued yet"). A pass that completed after it was created
 * re-read the forge after it, so no wake is lost — unless no such pass exists.
 */
import type { IUnstartedRun } from '../contracts/interfaces/rehearsal-evidence.interface';
import type { IRehearsalRun } from '../contracts/interfaces/rehearsal.interface';

/** Whether two runs are of one workflow file (or, without ids, of one name) on one branch. */
const sameGroup = (a: IRehearsalRun, b: IRehearsalRun): boolean =>
	a.headBranch === b.headBranch &&
	(a.workflowId !== undefined && b.workflowId !== undefined
		? a.workflowId === b.workflowId
		: a.workflow === b.workflow);

/**
 * The pass that covers `run`: a run of its workflow on its branch that
 * completed successfully after `run` was created. That pass re-read the forge
 * after the unstarted run existed, so the wake it carried was not lost.
 */
export const coveringRun = (
	run: IRehearsalRun,
	runs: readonly IRehearsalRun[],
): IRehearsalRun | undefined =>
	runs.find(
		(other) =>
			other.id !== run.id &&
			sameGroup(other, run) &&
			other.status === 'completed' &&
			other.conclusion === 'success' &&
			other.updatedAt > run.createdAt,
	);

/** `run` as the unstarted run it is, judged against every run seen on its branch. */
export const unstartedOf = (
	run: IRehearsalRun,
	runs: readonly IRehearsalRun[],
): IUnstartedRun => {
	const covering = coveringRun(run, runs);
	return {
		id: run.id,
		workflow: run.workflow,
		branch: run.headBranch,
		lost: covering === undefined,
		...(covering === undefined ? {} : { coveredBy: covering.id }),
	};
};

/** The unstarted runs once each id is listed once, the newest judgement kept. */
export const mergeUnstarted = (
	...lists: readonly (readonly IUnstartedRun[])[]
): readonly IUnstartedRun[] => [
	...new Map(lists.flat().map((one) => [one.id, one] as const)).values(),
];
