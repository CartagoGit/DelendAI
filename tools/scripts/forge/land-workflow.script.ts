#!/usr/bin/env bun
/**
 * land-workflow.script.ts — renders this repository's instance of the land
 * workflow template. `--check` fails when the committed file differs.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import {
	renderLandWorkflow,
	type ILandWorkflowInput,
} from '@delendai/core/cli';

export const LAND_WORKFLOW_PATH = '.github/workflows/land.yml';

/** This repository's values for the template. */
export const REPO_LAND_WORKFLOW: ILandWorkflowInput = {
	integrationBranch: 'develop',
	ciWorkflowName: 'CI',
	afterMergeWorkflows: ['ci.yml', 'open-promotion.yml'],
	engineVariable: 'DELENDAI_INTEGRATION_ENGINE',
	cron: '*/15 * * * *',
	passCommand: 'bun tools/scripts/forge/land.script.ts',
	setupSteps: [
		'- name: Checkout (required to resolve the local composite action)',
		'  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
		'',
		'- name: Setup repo (checkout + bun + install)',
		'  uses: ./.github/actions/setup-bun-repo',
		'  with:',
		'      # Full history: a batch merges members onto the tip.',
		"      fetch-depth: '0'",
	],
};

if (import.meta.main) {
	const rendered = renderLandWorkflow(REPO_LAND_WORKFLOW);
	if (process.argv.includes('--check')) {
		const same = readFileSync(LAND_WORKFLOW_PATH, 'utf8') === rendered;
		if (!same)
			console.error(
				`${LAND_WORKFLOW_PATH} differs from its template; run land-workflow.script.ts`,
			);
		process.exit(same ? 0 : 1);
	}
	writeFileSync(LAND_WORKFLOW_PATH, rendered);
}
