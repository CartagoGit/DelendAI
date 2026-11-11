/**
 * land-follow-ups.helper.ts — what the integrator starts after it merged.
 *
 * The integrator merges with the forge's workflow token, and a push made with
 * that token starts no workflow: after a merge the integration branch got no
 * security scan and no next pass, and on 2026-11-10 it went two days without
 * one while alerts landed. So, after a pass that merged, the integrator
 * starts on the integration branch every workflow a person's push there
 * would have started, except those that already run when the integrator
 * finishes (they follow it by themselves). A workflow a push starts but
 * that cannot be started on request is named, not skipped in silence.
 */
import type { ILandFollowUps, ILandWorkflowTriggers } from './land.interface';

/** The follow-ups of a merge by `integrator` (its workflow name). Pure. */
export const followUpWorkflows = (
	workflows: readonly ILandWorkflowTriggers[],
	integrator: string,
): ILandFollowUps => {
	const pushed = workflows.filter(
		(workflow) =>
			workflow.pushesIntegration &&
			!workflow.afterWorkflows.includes(integrator),
	);
	return {
		dispatch: pushed
			.filter((workflow) => workflow.dispatchable)
			.map((workflow) => workflow.file),
		unreachable: pushed
			.filter((workflow) => !workflow.dispatchable)
			.map((workflow) => workflow.file),
	};
};
