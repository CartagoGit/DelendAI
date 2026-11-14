/**
 * rehearsal-ci-workflow.helper.ts — the workflows a rehearsal branch
 * carries besides the integrator: a fast CI that sleeps and concludes as
 * each synthetic pull request declares, a push-started stand-in for the
 * scan, and a workflow that writes with the workflow token so a run can
 * show what such writes start (nothing).
 *
 * Every value that comes from an event reaches the shell through `env`,
 * never through an expression inside a `run` script.
 */
import type { ILandWorkflowIdentity } from '@delendai/core/cli';
import { identitySteps, tokenOf } from '@delendai/core/cli';

import {
	REHEARSAL_CHECKOUT_ACTION,
	REHEARSAL_CI_CHECK,
	REHEARSAL_DIR,
	REHEARSAL_TOKEN_OPEN_LABEL,
	REHEARSAL_TOKEN_PUSH_LABEL,
	REHEARSAL_WORKFLOW_NAME,
} from '../contracts/constants/rehearsal.constant';

import { renderSignalJob } from './integration-adoption.service';

const CI_TIMEOUT_MINUTES = 15;
const WORKFLOW_TIMEOUT_MINUTES = 45;
/** The user id of the GitHub Actions bot: its commit email carries it. */
const BOT_USER_ID = 41898282;

const lines = (...rows: readonly string[]): string => `${rows.join('\n')}\n`;

/**
 * The fast CI: on a pull request it reads `rehearsal/<run>/<key>.json`
 * (the key is the last segment of the head branch), sleeps the declared
 * seconds and concludes as declared; on a push to the integration branch it
 * concludes green at once.
 */
export const renderRehearsalCiWorkflow = (input: {
	readonly integration: string;
	readonly runId: string;
}): string =>
	lines(
		`name: ${REHEARSAL_CI_CHECK}`,
		'',
		`# Rendered by the integration plugin's rehearsal for run ${input.runId}.`,
		'on:',
		'    pull_request:',
		`        branches: ['${input.integration}']`,
		'    push:',
		`        branches: ['${input.integration}']`,
		'',
		'permissions:',
		'    contents: read',
		'',
		'jobs:',
		`    ${REHEARSAL_CI_CHECK}:`,
		`        name: ${REHEARSAL_CI_CHECK}`,
		'        runs-on: ubuntu-latest',
		`        timeout-minutes: ${String(CI_TIMEOUT_MINUTES)}`,
		'        steps:',
		`            - uses: ${REHEARSAL_CHECKOUT_ACTION}`,
		'            - name: Conclude as the pull request declares',
		'              env:',
		'                  HEAD_REF: ${{ github.head_ref }}',
		`                  RUN_DIR: ${REHEARSAL_DIR}/${input.runId}`,
		'              run: |',
		'                  if [ -z "$HEAD_REF" ]; then echo "push: nothing declared"; exit 0; fi',
		'                  declaration="$RUN_DIR/${HEAD_REF##*/}.json"',
		'                  if [ ! -f "$declaration" ]; then echo "no declaration at $declaration"; exit 1; fi',
		`                  seconds=$(jq -r '.seconds' "$declaration")`,
		`                  result=$(jq -r '.result' "$declaration")`,
		'                  echo "declared: $result after ${seconds}s"',
		'                  sleep "$seconds"',
		'                  [ "$result" = success ]',
		'',
		renderSignalJob({
			needs: [REHEARSAL_CI_CHECK],
			integrationBranch: input.integration,
		}).trimEnd(),
	);

/** A workflow every push to the integration branch starts: where the scan would run. */
export const renderRehearsalScanWorkflow = (input: {
	readonly integration: string;
}): string =>
	lines(
		'name: rehearsal-scan',
		'',
		'on:',
		'    push:',
		`        branches: ['${input.integration}']`,
		'',
		'permissions:',
		'    contents: read',
		'',
		'jobs:',
		'    scan:',
		'        name: rehearsal-scan',
		'        runs-on: ubuntu-latest',
		'        timeout-minutes: 5',
		'        steps:',
		'            - name: The push started a scan',
		'              env:',
		'                  SHA: ${{ github.sha }}',
		'              run: echo "scanned $SHA"',
	);

/**
 * Writes with the workflow token when the harness labels a pull request:
 * `<prefix>token-push` commits to its head, `<prefix>token-open` opens a
 * pull request from a new branch. Each is what a production automation
 * did; the run then reads whether the forge built the result.
 */
export const renderRehearsalTokenWorkflow = (input: {
	readonly integration: string;
	readonly labelPrefix: string;
	readonly branchPrefix: string;
}): string => {
	const push = `${input.labelPrefix}${REHEARSAL_TOKEN_PUSH_LABEL}`;
	const open = `${input.labelPrefix}${REHEARSAL_TOKEN_OPEN_LABEL}`;
	return lines(
		'name: rehearsal-token',
		'',
		'on:',
		'    pull_request:',
		'        types: [labeled]',
		`        branches: ['${input.integration}']`,
		'',
		'permissions:',
		'    contents: write',
		'    pull-requests: write',
		'',
		'jobs:',
		'    write:',
		`        if: \${{ github.event.label.name == '${push}' || github.event.label.name == '${open}' }}`,
		'        runs-on: ubuntu-latest',
		'        timeout-minutes: 5',
		'        steps:',
		`            - uses: ${REHEARSAL_CHECKOUT_ACTION}`,
		'              with:',
		'                  ref: ${{ github.head_ref }}',
		'            - name: Write with the workflow token',
		'              env:',
		'                  GH_TOKEN: ${{ github.token }}',
		'                  LABEL: ${{ github.event.label.name }}',
		'                  HEAD_REF: ${{ github.head_ref }}',
		'                  NUMBER: ${{ github.event.pull_request.number }}',
		`                  PUSH_LABEL: ${push}`,
		`                  BASE: ${input.integration}`,
		`                  BRANCH_PREFIX: ${input.branchPrefix}`,
		'              run: |',
		'                  git config user.name "github-actions[bot]"',
		`                  git config user.email "${String(BOT_USER_ID)}+github-actions[bot]@users.noreply.github.com"`,
		`                  mkdir -p ${REHEARSAL_DIR}/token`,
		`                  echo "$NUMBER $LABEL" > "${REHEARSAL_DIR}/token/$NUMBER.txt"`,
		`                  git add "${REHEARSAL_DIR}/token/$NUMBER.txt"`,
		'                  if [ "$LABEL" = "$PUSH_LABEL" ]; then',
		'                      git commit -m "rehearsal: a push with the workflow token"',
		'                      git push origin "HEAD:$HEAD_REF"',
		'                  else',
		'                      branch="${BRANCH_PREFIX}token-open-$NUMBER"',
		'                      git switch -c "$branch"',
		'                      git commit -m "rehearsal: a pull request opened with the workflow token"',
		'                      git push origin "$branch"',
		'                      gh pr create --base "$BASE" --head "$branch" --title "rehearsal: opened with the workflow token" --body "Opened by rehearsal-token for #$NUMBER."',
		'                  fi',
	);
};

/**
 * The workflow that runs the rehearsal: on demand, and on a push to a
 * publication branch that touches the integration code. It never runs on the
 * integration or release branch, and its job reports whatever happens.
 */
export const renderRehearsalWorkflow = (input: {
	readonly namespace: string;
	readonly codePaths: readonly string[];
	/** Who the rehearsal acts as: the workflow token cannot write trees. */
	readonly identity: ILandWorkflowIdentity;
}): string =>
	lines(
		`name: ${REHEARSAL_WORKFLOW_NAME}`,
		'',
		"# GENERATED from the integration plugin's rehearsal template",
		'# (renderRehearsalWorkflow); edit the template, not this file.',
		'on:',
		'    workflow_dispatch:',
		'    push:',
		`        branches: ['${input.namespace}/pr/**']`,
		'        paths:',
		...input.codePaths.map((path) => `            - '${path}'`),
		'',
		"# One rehearsal at a time: a second run would read the first one's branches.",
		'concurrency:',
		`    group: ${REHEARSAL_WORKFLOW_NAME}`,
		'    cancel-in-progress: false',
		'',
		'permissions:',
		'    contents: write',
		'    pull-requests: write',
		'    issues: write',
		'    actions: read',
		'',
		'jobs:',
		`    ${REHEARSAL_WORKFLOW_NAME}:`,
		`        name: ${REHEARSAL_WORKFLOW_NAME}`,
		'        runs-on: ubuntu-latest',
		`        timeout-minutes: ${String(WORKFLOW_TIMEOUT_MINUTES)}`,
		'        steps:',
		...identitySteps(input.identity).map((line) =>
			line === '' ? line : `            ${line}`,
		),
		`            - uses: ${REHEARSAL_CHECKOUT_ACTION}`,
		'            - uses: ./.github/actions/setup-bun-repo',
		'            - name: Rehearse the pull request flow on the real forge',
		'              env:',
		`                  GH_TOKEN: ${tokenOf(input.identity)}`,
		'              run: bun run cli -- integration rehearse --mode=fast --scenarios=all',
	);
