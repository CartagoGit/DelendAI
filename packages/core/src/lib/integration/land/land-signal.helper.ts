/**
 * land-signal.helper.ts — what wakes the integrator. A `pull_request_target`
 * workflow is read from the repository's default branch, whatever the pull
 * request's base, so the land workflow never starts on a pull request event;
 * and a public repository without an event policy blocks that event by
 * default. Instead a signal holding only the workflow token with
 * `actions: write` dispatches `land.yml` at the pull request's base ref, the
 * trusted file of the integration branch. The signal never holds the
 * identity and never checks out code.
 */

import {
	LAND_SIGNAL_EVENTS,
	LAND_SIGNAL_TIMEOUT_MINUTES,
	LAND_SIGNAL_WORKFLOW_NAME,
	LAND_WORKFLOW_FILE,
} from './land.constant';

/**
 * The step that dispatches the integrator at `branch` (an expression or a
 * name), unindented: the one text both the signal workflow and the CI's last
 * job use. A refused dispatch warns and never fails the signal.
 */
export const wakeIntegratorStep = (input: {
	readonly branchExpression: string;
	/** Set when the dispatch also carries the `promote` flag (a push). */
	readonly promoteExpression?: string;
}): string[] => [
	'- name: Wake the integrator',
	'  env:',
	'      GH_TOKEN: ${{ github.token }}',
	`      BRANCH: ${input.branchExpression}`,
	'      PULL_REQUEST: ${{ github.event.pull_request.number }}',
	...(input.promoteExpression === undefined
		? []
		: [`      PROMOTE: ${input.promoteExpression}`]),
	'  run: |',
	`      gh workflow run ${LAND_WORKFLOW_FILE} \\`,
	'        --ref "${BRANCH}" --repo "${GITHUB_REPOSITORY}" \\',
	input.promoteExpression === undefined
		? '        -f pr="${PULL_REQUEST}" \\'
		: '        -f pr="${PULL_REQUEST}" -f promote="${PROMOTE}" \\',
	'        || echo "::warning::could not wake the integrator"',
];

/** `lines` indented by `by` spaces, blank lines left blank. */
export const indentLines = (lines: readonly string[], by: number): string[] =>
	lines.map((line) => (line === '' ? line : `${' '.repeat(by)}${line}`));

/** The workflow file that wakes the integrator on the pull request events. */
export const renderLandSignalWorkflow = (input: {
	readonly integrationBranch: string;
}): string =>
	[
		`name: ${LAND_SIGNAL_WORKFLOW_NAME}`,
		'',
		'# GENERATED from the land signal template (renderLandSignalWorkflow); edit',
		`# the template, not this file. A pull request event dispatches ${LAND_WORKFLOW_FILE} at`,
		"# the pull request's base ref. It holds only the workflow token, which can",
		'# dispatch and nothing else, and it checks out no code.',
		'',
		'on:',
		'    pull_request:',
		`        types: [${LAND_SIGNAL_EVENTS.join(', ')}]`,
		`        branches: [${input.integrationBranch}]`,
		'',
		'permissions:',
		'    actions: write',
		'    contents: read',
		'',
		'jobs:',
		`    ${LAND_SIGNAL_WORKFLOW_NAME}:`,
		`        name: ${LAND_SIGNAL_WORKFLOW_NAME}`,
		'        runs-on: ubuntu-latest',
		`        timeout-minutes: ${String(LAND_SIGNAL_TIMEOUT_MINUTES)}`,
		'        steps:',
		...indentLines(
			wakeIntegratorStep({
				branchExpression: '${{ github.event.pull_request.base.ref }}',
			}),
			12,
		),
		'',
	].join('\n');
