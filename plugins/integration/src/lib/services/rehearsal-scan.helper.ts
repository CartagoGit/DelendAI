import type { IRehearsalRun } from '../contracts/interfaces/rehearsal.interface';

const SCAN_WORKFLOW = 'rehearsal-scan';

/**
 * Whether the push of `sha` started the scan workflow: the one run the
 * integration-branch targets judge, so no other workflow's push run (the
 * integrator's own is listed first) stands in for it.
 */
export const scanStarted = (
	runs: readonly IRehearsalRun[],
	sha: string,
): boolean =>
	runs.some(
		(run) =>
			run.event === 'push' &&
			run.headSha === sha &&
			run.workflow === SCAN_WORKFLOW,
	);
