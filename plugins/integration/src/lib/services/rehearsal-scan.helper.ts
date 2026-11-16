import {
	REHEARSAL_FAST_WORKFLOW_NAMES,
	REHEARSAL_REAL_CI_FILE,
	REHEARSAL_REAL_SCAN_FILE,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalRun,
	IRehearsalWorkflowNames,
} from '../contracts/interfaces/rehearsal.interface';

const WORKFLOWS_DIR = '.github/workflows';
const NAME_LINE = /^name:\s*(?:'([^']*)'|"([^"]*)"|(\S.*?))\s*(?:#.*)?$/mu;

/** The name a workflow file lists its runs under: its `name:`, else its path. */
const listedName = (file: string, text: string | undefined): string => {
	const match = text === undefined ? null : NAME_LINE.exec(text);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? `${WORKFLOWS_DIR}/${file}`;
};

/** The names of the project's CI and scan workflows, read from the files the run copies. */
export const realWorkflowNames = (
	workflows: Readonly<Record<string, string>>,
): IRehearsalWorkflowNames => ({
	ci: listedName(REHEARSAL_REAL_CI_FILE, workflows[REHEARSAL_REAL_CI_FILE]),
	scan: listedName(
		REHEARSAL_REAL_SCAN_FILE,
		workflows[REHEARSAL_REAL_SCAN_FILE],
	),
});

/**
 * Whether the push of `sha` started the scan workflow: the one run the
 * integration-branch targets judge, so no other workflow's push run (the
 * integrator's own is listed first) stands in for it.
 */
export const scanStarted = (
	runs: readonly IRehearsalRun[],
	sha: string,
	names: IRehearsalWorkflowNames = REHEARSAL_FAST_WORKFLOW_NAMES,
): boolean =>
	runs.some(
		(run) =>
			run.event === 'push' &&
			run.headSha === sha &&
			run.workflow === names.scan,
	);
