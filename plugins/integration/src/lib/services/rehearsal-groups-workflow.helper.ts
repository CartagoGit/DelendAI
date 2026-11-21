/**
 * rehearsal-groups-workflow.helper.ts — the three jobs of the rehearsal
 * workflow: `plan` prints the groups of the mode's catalogue, `play` is one
 * job per group (its own run root, its own sweep, a partial report), and
 * `report` merges the partial reports into the one report of the mode.
 */
import {
	MODE_EXPRESSION,
	REHEARSAL_ALL_SCENARIOS,
	REHEARSAL_CHECKOUT_ACTION,
	REHEARSAL_DOWNLOAD_ACTION,
	REHEARSAL_GROUP_REPORTS_DIR,
	REHEARSAL_IN_PROCESS_COMMAND,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_REAL_FORGE_CONDITION,
	REHEARSAL_REPORT_DIR,
	REHEARSAL_REPORT_RETENTION_DAYS,
	REHEARSAL_UPLOAD_ACTION,
} from '../contracts/constants/rehearsal.constant';

const PLAN_TIMEOUT_MINUTES = 10;
const REPORT_TIMEOUT_MINUTES = 10;
const STEP = '            ';
const SCENARIOS_EXPRESSION = `\${{ inputs.scenarios || '${REHEARSAL_ALL_SCENARIOS}' }}`;
const GROUP_ENV = `${STEP}      REHEARSAL_GROUP: \${{ matrix.group }}/\${{ needs.plan.outputs.total }}`;
const PLAN_OUTPUTS = ['matrix', 'total', 'parallel'] as const;

const repoSetup = [
	`${STEP}- uses: ${REHEARSAL_CHECKOUT_ACTION}`,
	`${STEP}- uses: ./.github/actions/setup-bun-repo`,
];

/** The `plan` job: the matrix of groups, their number, and how many play at once. */
const planJob = (command: string): readonly string[] => [
	'    plan:',
	'        name: plan',
	`        if: ${REHEARSAL_REAL_FORGE_CONDITION}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(PLAN_TIMEOUT_MINUTES)}`,
	'        outputs:',
	...PLAN_OUTPUTS.map(
		(name) => `            ${name}: \${{ steps.plan.outputs.${name} }}`,
	),
	'        steps:',
	...repoSetup,
	`${STEP}- name: Cut the catalogue into groups`,
	`${STEP}  id: plan`,
	`${STEP}  env:`,
	`${STEP}      REHEARSAL_MODE: ${MODE_EXPRESSION}`,
	`${STEP}      REHEARSAL_SCENARIOS: ${SCENARIOS_EXPRESSION}`,
	`${STEP}  run: ${command} integration rehearse --plan --mode="$REHEARSAL_MODE" --scenarios="$REHEARSAL_SCENARIOS" | grep -E '^(${PLAN_OUTPUTS.join('|')})=' >> "$GITHUB_OUTPUT"`,
	'',
];

/** The `play` job: one matrix entry per group, all with the rehearsal's timeout. */
const playJob = (input: {
	readonly identity: readonly string[];
	readonly token: string;
	readonly command: string;
}): readonly string[] => [
	'    play:',
	'        name: play ${{ matrix.group }}/${{ needs.plan.outputs.total }}',
	'        needs: plan',
	`        if: ${REHEARSAL_REAL_FORGE_CONDITION}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(REHEARSAL_JOB_TIMEOUT_MINUTES)}`,
	'        strategy:',
	'            fail-fast: false',
	'            max-parallel: ${{ fromJSON(needs.plan.outputs.parallel) }}',
	'            matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}',
	'        steps:',
	...input.identity.map((line) => (line === '' ? line : `${STEP}${line}`)),
	...repoSetup,
	`${STEP}- name: Rehearse this group on the real forge`,
	`${STEP}  env:`,
	`${STEP}      GH_TOKEN: ${input.token}`,
	`${STEP}      REHEARSAL_MODE: ${MODE_EXPRESSION}`,
	`${STEP}      REHEARSAL_SCENARIOS: ${SCENARIOS_EXPRESSION}`,
	GROUP_ENV,
	`${STEP}  run: ${input.command} integration rehearse --mode="$REHEARSAL_MODE" --scenarios="$REHEARSAL_SCENARIOS" --group="$REHEARSAL_GROUP"`,
	'',
	// The in-process cleanup does not run when the job is cancelled or times out: this step does,
	// for this group's root and the roots too old to belong to a live run, never a sibling group's.
	`${STEP}- name: Remove what this group left on the forge`,
	`${STEP}  if: always()`,
	`${STEP}  env:`,
	`${STEP}      GH_TOKEN: ${input.token}`,
	GROUP_ENV,
	`${STEP}  run: ${input.command} integration rehearse --sweep --group="$REHEARSAL_GROUP"`,
	'',
	`${STEP}- name: Keep the partial report for the merge`,
	`${STEP}  if: always()`,
	`${STEP}  uses: ${REHEARSAL_UPLOAD_ACTION}`,
	`${STEP}  with:`,
	`${STEP}      name: rehearsal-report-${MODE_EXPRESSION}-\${{ matrix.group }}`,
	`${STEP}      path: ${REHEARSAL_REPORT_DIR}/report-${MODE_EXPRESSION}-\${{ matrix.group }}.json`,
	`${STEP}      if-no-files-found: ignore`,
	`${STEP}      retention-days: ${String(REHEARSAL_REPORT_RETENTION_DAYS)}`,
	'',
];

/** The `report` job: merges the partial reports; a group without one fails it by name. */
const reportJob = (command: string): readonly string[] => [
	'    report:',
	'        name: report',
	'        needs: [plan, play]',
	`        if: always() && ${REHEARSAL_REAL_FORGE_CONDITION}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(REPORT_TIMEOUT_MINUTES)}`,
	'        steps:',
	...repoSetup,
	`${STEP}- name: Fetch the partial reports`,
	// A group that left none is named by the merge; nothing to fetch is not a failure here.
	`${STEP}  continue-on-error: true`,
	`${STEP}  uses: ${REHEARSAL_DOWNLOAD_ACTION}`,
	`${STEP}  with:`,
	`${STEP}      pattern: rehearsal-report-${MODE_EXPRESSION}-*`,
	`${STEP}      path: ${REHEARSAL_GROUP_REPORTS_DIR}`,
	`${STEP}      merge-multiple: true`,
	'',
	`${STEP}- name: Merge the groups into the report of the mode`,
	`${STEP}  env:`,
	`${STEP}      REHEARSAL_MODE: ${MODE_EXPRESSION}`,
	`${STEP}      REHEARSAL_SCENARIOS: ${SCENARIOS_EXPRESSION}`,
	`${STEP}  run: ${command} integration rehearse --merge --mode="$REHEARSAL_MODE" --scenarios="$REHEARSAL_SCENARIOS"`,
	'',
	`${STEP}- name: Keep the report as evidence for this commit`,
	`${STEP}  if: always()`,
	`${STEP}  uses: ${REHEARSAL_UPLOAD_ACTION}`,
	`${STEP}  with:`,
	`${STEP}      name: rehearsal-report-${MODE_EXPRESSION}`,
	`${STEP}      path: ${REHEARSAL_REPORT_DIR}/report-${MODE_EXPRESSION}.json`,
	`${STEP}      if-no-files-found: ignore`,
	`${STEP}      retention-days: ${String(REHEARSAL_REPORT_RETENTION_DAYS)}`,
];

/** What a pull request runs: the rehearsal on the in-process fake forge, which opens nothing on the real one. */
const inProcessJob = (): readonly string[] => [
	'    in-process:',
	'        name: in-process',
	"        if: github.event_name == 'pull_request'",
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(PLAN_TIMEOUT_MINUTES)}`,
	'        steps:',
	...repoSetup,
	`${STEP}- name: Play the land specs against the fake forge`,
	`${STEP}  run: ${REHEARSAL_IN_PROCESS_COMMAND}`,
	'',
];

/** The `cleanup` job: sweeps what the plays left, even when a play failed or was cancelled. */
const cleanupJob = (input: {
	readonly identity: readonly string[];
	readonly token: string;
	readonly command: string;
}): readonly string[] => [
	'',
	'    cleanup:',
	'        name: cleanup',
	'        needs: [play]',
	`        if: always() && ${REHEARSAL_REAL_FORGE_CONDITION}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(REPORT_TIMEOUT_MINUTES)}`,
	'        steps:',
	...input.identity.map((line) => (line === '' ? line : `${STEP}${line}`)),
	...repoSetup,
	`${STEP}- name: Close the pull requests and delete the refs of the run`,
	`${STEP}  env:`,
	`${STEP}      GH_TOKEN: ${input.token}`,
	`${STEP}  run: ${input.command} integration rehearse --sweep`,
];

/** The `jobs:` body of the rehearsal workflow. */
export const rehearsalGroupJobs = (input: {
	readonly identity: readonly string[];
	readonly token: string;
	readonly command: string;
}): readonly string[] => [
	...inProcessJob(),
	...planJob(input.command),
	...playJob(input),
	...reportJob(input.command),
	...cleanupJob(input),
];
