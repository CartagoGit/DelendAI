/**
 * integration-adoption.service.ts — what `integration adopt` writes into
 * another project: the integrator workflow, the CI signal job and the
 * rehearsal workflow, all rendered from that project's policy values.
 *
 * Validations are the project's own required checks and CI: the signal job
 * waits on the jobs the project names, and nothing here points at a path,
 * script or action that belongs to this repository.
 */
import { renderLandWorkflow } from '@delendai/core/cli';

import type {
	IAdoptionInput,
	IAdoptionOutput,
} from '../contracts/interfaces/integration-adoption.interface';

const WORKFLOWS = '.github/workflows';
const LAND_FILE = 'land.yml';
const REHEARSAL_FILE = 'rehearsal.yml';
const CHECKOUT =
	'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7';
const REHEARSAL_TIMEOUT_MINUTES = 45;
const SIGNAL_TIMEOUT_MINUTES = 5;

/** The command a runner uses to run the delendai CLI at the pinned version. */
const cliCommand = (version: string): string =>
	`npx --yes @delendai/cli@${version}`;

/**
 * The job to append to the project's own CI: it runs last, whatever the
 * others concluded, and wakes the integrator. A dispatch is the one write
 * the workflow token may make here.
 */
export const renderSignalJob = (input: {
	readonly needs: readonly string[];
	readonly integrationBranch: string;
}): string =>
	[
		'    integration-signal:',
		'        name: integration-signal',
		`        needs: [${input.needs.join(', ')}]`,
		`        if: \${{ always() && (github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref == 'refs/heads/${input.integrationBranch}')) }}`,
		'        runs-on: ubuntu-latest',
		`        timeout-minutes: ${String(SIGNAL_TIMEOUT_MINUTES)}`,
		'        permissions:',
		'            actions: write',
		'            contents: read',
		'        steps:',
		'            - name: Wake the integrator',
		'              env:',
		'                  GH_TOKEN: ${{ github.token }}',
		'                  BRANCH: ${{ github.event.pull_request.base.ref || github.ref_name }}',
		'                  PULL_REQUEST: ${{ github.event.pull_request.number }}',
		"                  PROMOTE: ${{ github.event_name == 'push' && 'true' || '' }}",
		'              run: |',
		`                  gh workflow run ${LAND_FILE} \\`,
		'                    --ref "${BRANCH}" --repo "${GITHUB_REPOSITORY}" \\',
		'                    -f pr="${PULL_REQUEST}" -f promote="${PROMOTE}" \\',
		'                    || echo "::warning::could not wake the integrator"',
		'',
	].join('\n');

/** The rehearsal workflow: on demand, never on the integration or release branch. */
export const renderAdoptedRehearsalWorkflow = (input: {
	readonly version: string;
}): string =>
	[
		'name: rehearsal',
		'',
		'on:',
		'    workflow_dispatch:',
		'',
		"# One rehearsal at a time: a second run would read the first one's branches.",
		'concurrency:',
		'    group: rehearsal',
		'    cancel-in-progress: false',
		'',
		'permissions:',
		'    contents: write',
		'    pull-requests: write',
		'    issues: write',
		'    actions: read',
		'',
		'jobs:',
		'    rehearsal:',
		'        name: rehearsal',
		'        runs-on: ubuntu-latest',
		`        timeout-minutes: ${String(REHEARSAL_TIMEOUT_MINUTES)}`,
		'        steps:',
		`            - uses: ${CHECKOUT}`,
		'            - name: Rehearse the pull request flow on the real forge',
		'              env:',
		'                  GH_TOKEN: ${{ github.token }}',
		`              run: ${cliCommand(input.version)} integration rehearse --mode=fast --scenarios=all`,
		'',
	].join('\n');

/** Everything `integration adopt` writes or prints for one project. */
export const renderAdoption = (input: IAdoptionInput): IAdoptionOutput => ({
	files: [
		{
			path: `${WORKFLOWS}/${LAND_FILE}`,
			content: renderLandWorkflow({
				integrationBranch: input.integrationBranch,
				releaseBranch: input.releaseBranch,
				identity: input.identity,
				cron: input.cron,
				passCommand: `${cliCommand(input.version)} integration pass`,
				setupSteps: [
					`- uses: ${CHECKOUT}`,
					'  with:',
					"      fetch-depth: '0'",
				],
			}),
		},
		{
			path: `${WORKFLOWS}/${REHEARSAL_FILE}`,
			content: renderAdoptedRehearsalWorkflow({
				version: input.version,
			}),
		},
	],
	signalJob: renderSignalJob({
		needs: input.requiredJobs,
		integrationBranch: input.integrationBranch,
	}),
});
