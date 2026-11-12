/**
 * rehearsal-names.helper.ts — where a rehearsal's branches, files and labels
 * live, so the run, the cleanup and the setup agree on them.
 */
import { REHEARSAL_DIR } from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalFileChange,
	IRehearsalPullSpec,
} from '../contracts/interfaces/rehearsal.interface';

/** Where a run's branches live: `<prefix><runId>/`. */
export const runBranchRoot = (prefix: string, runId: string): string =>
	`${prefix}${runId}/`;

/** The integration branch of one scenario of a run. */
export const scenarioIntegration = (
	prefix: string,
	runId: string,
	scenario: string,
): string => `${runBranchRoot(prefix, runId)}${scenario}-integration`;

/** A synthetic pull request's head: its last segment is its declaration's name. */
export const pullHead = (
	prefix: string,
	runId: string,
	scenario: string,
	key: string,
): string => `${runBranchRoot(prefix, runId)}${scenario}-${key}`;

/** The declaration the fast CI reads for a head (see the CI workflow). */
export const declarationPath = (
	runId: string,
	scenario: string,
	key: string,
): string => `${REHEARSAL_DIR}/${runId}/${scenario}-${key}.json`;

/** The labels a run creates start with this, so cleanup finds them. */
export const runLabelPrefix = (runId: string): string => `rehearsal-${runId}:`;

/** The files a synthetic pull request writes: its declaration, then its own. */
export const pullChanges = (
	runId: string,
	scenario: string,
	spec: IRehearsalPullSpec,
	extra: Readonly<Record<string, string>> = {},
): readonly IRehearsalFileChange[] => {
	const files = { ...spec.files, ...extra };
	for (const path of Object.keys(files))
		if (!path.startsWith(`${REHEARSAL_DIR}/`))
			throw new Error(
				`a synthetic pull request writes only under ${REHEARSAL_DIR}/: ${path}`,
			);
	return [
		{
			path: declarationPath(runId, scenario, spec.key),
			content: `${JSON.stringify(spec.declaration, null, '\t')}\n`,
		},
		...Object.entries(files).map(([path, content]) => ({ path, content })),
	];
};
