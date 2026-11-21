/**
 * land-workflow-reconcile.helper.ts — the step of the pass job that settles
 * refs after the pass: a merge and a closing pull request each leave some.
 * The scheduled run has the upkeep for that, so it is skipped there.
 */

/** The step's YAML lines, ending in a blank one, or none without a command; `env` is the token's rendered lines. */
export const reconcileStep = (
	command: string | undefined,
	env: readonly string[],
): readonly string[] =>
	command === undefined
		? []
		: [
				'- name: Reconcile the refs the pass left behind',
				`  if: \${{ !cancelled() && github.event_name != 'schedule' }}`,
				...env,
				`  run: ${command}`,
				'',
			];

/** The promote job's repair step: a red run's culprit merge reverted; leading blank line, none without a command. */
export const repairStep = (
	command: string | undefined,
	env: readonly string[],
): readonly string[] =>
	command === undefined
		? []
		: [
				'',
				'- name: Revert the culprit merge of a red run as a repair',
				...env,
				`  run: ${command}`,
			];
