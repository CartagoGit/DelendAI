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
const NAME_KEY = 'name:';

/** The value of a `name:` line, by string operations only: quoted up to the closing quote, else up to a ` #` comment. */
const nameValue = (afterKey: string): string => {
	const value = afterKey.trim();
	const quote = value.charAt(0);
	if (quote === "'" || quote === '"') {
		const close = value.indexOf(quote, 1);
		return close < 0 ? value.slice(1) : value.slice(1, close);
	}
	const comment = value.indexOf(' #');
	return (comment < 0 ? value : value.slice(0, comment)).trimEnd();
};

/** The name a workflow file lists its runs under: its `name:`, else its path. */
const listedName = (file: string, text: string | undefined): string => {
	const line = text?.split('\n').find((one) => one.startsWith(NAME_KEY));
	const name =
		line === undefined ? '' : nameValue(line.slice(NAME_KEY.length));
	return name === '' ? `${WORKFLOWS_DIR}/${file}` : name;
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
