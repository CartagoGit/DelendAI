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
	LAND_QUEUED_PASS_FRESH_SECONDS,
	LAND_SIGNAL_EVENTS,
	LAND_SIGNAL_TIMEOUT_MINUTES,
	LAND_SIGNAL_WORKFLOW_NAME,
	LAND_WORKFLOW_FILE,
} from './land.constant';

/**
 * A pass already queued (or pending behind the group's running one) for the
 * branch reads everything when it starts, so a second dispatch adds nothing:
 * skip it. A pass in progress does not count
 * (it may have read the forge before this event), nor do the kinds that are
 * not a pass, nor a queued pass older than a couple of minutes. A dispatch
 * that carries `promote` is never skipped. The run's name ends with its group
 * (see renderLandWorkflow): `<group>-pass-<branch>`.
 */
const waitingRunGuard = [
	'      if [ -z "${PROMOTE:-}" ]; then',
	'        QUEUED=$(gh run list --workflow ' +
		LAND_WORKFLOW_FILE +
		' --repo "${GITHUB_REPOSITORY}" \\',
	'          --branch "${BRANCH}" --limit 30 --json status,displayTitle,createdAt --jq \\',
	`          '[.[] | select(.status | IN("queued", "pending", "waiting", "requested")) | select(.displayTitle | endswith("-pass-" + $ENV.BRANCH)) | select((.createdAt | fromdateiso8601) > (now - ${String(LAND_QUEUED_PASS_FRESH_SECONDS)}))] | length') || QUEUED=0`,
	'        if [ "${QUEUED:-0}" != "0" ]; then',
	'          echo "a pass is already queued for ${BRANCH}; it reads everything when it starts"',
	'          exit 0',
	'        fi',
	'      fi',
];

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
	...waitingRunGuard,
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
