/**
 * land-workflow-concurrency.helper.ts — how the rendered `land` workflow
 * serialises its runs: one group per kind of run and branch, at the
 * workflow level, and the run named by that group.
 */

import type { ILandWorkflowInput } from './land.interface';

/**
 * What a run is for, as a prefix of its concurrency group: `pass-` or the
 * name of another kind. Every kind has its own group, so a run that skips the pass never displaces
 * the pass another run has waiting.
 */
const kindPrefixExpression = (input: ILandWorkflowInput): string => {
	const release = `'${input.releaseBranch}'`;
	const kinds = [
		...(input.derived === undefined
			? []
			: [[`inputs.derived != ''`, 'derived-']]),
		[`inputs.promote != ''`, 'promote-'],
		[`github.event_name == 'schedule'`, 'upkeep-'],
		[
			`github.event_name == 'push' && github.ref_name == ${release}`,
			'forward-sync-',
		],
	];
	return `\${{ ${kinds.map(([when, prefix]) => `(${when}) && '${prefix}'`).join(' || ')} || 'pass-' }}`;
};

/**
 * One group per kind of run and branch, at the workflow level: GitHub keeps
 * one pending run per group and replaces it by a newer one, and none is
 * cancelled while it runs. A job-level group left runs queued with no job
 * for 40 minutes; a run that skips every job of a group never enters it.
 */
export const workflowConcurrencyLines = (
	baseGroup: string,
	input: ILandWorkflowInput,
): string[] => {
	const group = `${baseGroup}-${kindPrefixExpression(input)}\${{ github.ref_name }}`;
	return [
		'# One pending run per kind and branch; a run in progress is never cancelled.',
		'# The run is named by its group, so a signal can see which kind is queued.',
		`run-name: ${group}`,
		'concurrency:',
		`    group: ${group}`,
		'    cancel-in-progress: false',
	];
};
