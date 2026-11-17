/**
 * rehearsal-dispatch-steps.helper.ts — the parts of the rehearsal workflow
 * that both templates share: the dispatch inputs, the rehearse step that
 * reads them through `env`, and the upload of the report as evidence on the
 * forge, keyed by the commit the run is for.
 */
import {
	MODE_EXPRESSION,
	REHEARSAL_ALL_SCENARIOS,
	REHEARSAL_UPLOAD_ACTION,
	REHEARSAL_REPORT_DIR,
	REHEARSAL_REPORT_RETENTION_DAYS,
} from '../contracts/constants/rehearsal.constant';

/** The `on:` lines of a dispatch that takes a mode and the scenarios to play. */
export const rehearsalDispatchTrigger = (): readonly string[] => [
	'    workflow_dispatch:',
	'        inputs:',
	'            mode:',
	"                description: 'fast stand-ins, or the project CI and scan workflows'",
	'                type: choice',
	'                options: [fast, real]',
	'                default: fast',
	'            scenarios:',
	"                description: 'scenario ids separated by commas, or all'",
	'                type: string',
	`                default: ${REHEARSAL_ALL_SCENARIOS}`,
];

/** The rehearse step and the always-run upload of its report, at the step indent of the workflow. */
export const rehearsalRunSteps = (input: {
	readonly token: string;
	readonly command: string;
}): readonly string[] => [
	'            - name: Rehearse the pull request flow on the real forge',
	'              env:',
	`                  GH_TOKEN: ${input.token}`,
	`                  REHEARSAL_MODE: ${MODE_EXPRESSION}`,
	`                  REHEARSAL_SCENARIOS: \${{ inputs.scenarios || '${REHEARSAL_ALL_SCENARIOS}' }}`,
	`              run: ${input.command} integration rehearse --mode="$REHEARSAL_MODE" --scenarios="$REHEARSAL_SCENARIOS"`,
	'',
	// The in-process cleanup does not run when the job is cancelled or times out: this step does.
	'            - name: Remove what this run left on the forge',
	'              if: always()',
	'              env:',
	`                  GH_TOKEN: ${input.token}`,
	`              run: ${input.command} integration rehearse --sweep`,
	'',
	'            - name: Keep the report as evidence for this commit',
	'              if: always()',
	`              uses: ${REHEARSAL_UPLOAD_ACTION}`,
	'              with:',
	`                  name: rehearsal-report-${MODE_EXPRESSION}`,
	`                  path: ${REHEARSAL_REPORT_DIR}/report-${MODE_EXPRESSION}.json`,
	'                  if-no-files-found: ignore',
	`                  retention-days: ${String(REHEARSAL_REPORT_RETENTION_DAYS)}`,
];
