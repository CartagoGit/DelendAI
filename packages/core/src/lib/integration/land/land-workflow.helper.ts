/**
 * land-workflow.helper.ts — the `land` workflow, rendered from a template
 * and the project's values. This repository commits one instance
 * (`.github/workflows/land.yml`) and a spec keeps it equal to the render;
 * `delendai init` emits the same template for another project.
 */

import type { ILandWorkflowInput } from './land.interface';

const indent = (lines: readonly string[], by: number): string[] =>
	lines.map((line) => (line === '' ? line : `${' '.repeat(by)}${line}`));

export const renderLandWorkflow = (input: ILandWorkflowInput): string =>
	[
		'name: land',
		'',
		'# GENERATED from the land workflow template (renderLandWorkflow); edit the',
		'# project values, not this file. One stateless pass over the ready pull',
		'# requests: merge what does not overlap, batch what does, label the culprit',
		'# of a red batch. It keeps nothing; every pass reads the forge.',
		'#',
		`# Off unless the repository variable ${input.engineVariable} is \`land\`: the old`,
		'# queue must never run beside it.',
		'',
		'on:',
		'    workflow_run:',
		`        workflows: [${input.ciWorkflowName}]`,
		'        types: [completed]',
		'    check_suite:',
		'        types: [completed]',
		'    pull_request_target:',
		'        types: [ready_for_review]',
		`        branches: [${input.integrationBranch}]`,
		'    push:',
		`        branches: [${input.integrationBranch}]`,
		'    schedule:',
		`        - cron: '${input.cron}'`,
		'    workflow_dispatch:',
		'',
		'# Concurrency 1; a waiting pass is kept, since the next reads what the',
		'# cancelled one would have.',
		'concurrency:',
		'    group: land',
		'    cancel-in-progress: false',
		'',
		'permissions:',
		'    contents: write',
		'    pull-requests: write',
		'    checks: read',
		'    actions: write',
		'',
		'jobs:',
		'    land:',
		'        name: land',
		`        if: \${{ vars.${input.engineVariable} == 'land' }}`,
		'        runs-on: ubuntu-latest',
		'        timeout-minutes: 30',
		'        outputs:',
		'            merged: ${{ steps.pass.outputs.merged }}',
		'        steps:',
		...indent(input.setupSteps, 12),
		'',
		'            - name: One pass',
		'              id: pass',
		'              env:',
		'                  GH_TOKEN: ${{ github.token }}',
		'                  GITHUB_REPOSITORY: ${{ github.repository }}',
		`                  DELENDAI_INTEGRATION_ENGINE: \${{ vars.${input.engineVariable} }}`,
		`              run: ${input.passCommand}`,
		'',
		'    # A merge made with the workflow token starts no workflow of its own, so',
		'    # what follows a merge is started here.',
		'    after-merge:',
		'        name: after-merge',
		'        needs: land',
		"        if: ${{ !cancelled() && needs.land.outputs.merged == 'true' }}",
		'        runs-on: ubuntu-latest',
		'        timeout-minutes: 5',
		'        steps:',
		'            - name: Run what follows a merge on the new tip',
		'              env:',
		'                  GH_TOKEN: ${{ github.token }}',
		'              run: |',
		...input.afterMergeWorkflows.map(
			(file) =>
				`                  gh workflow run ${file} --repo "$GITHUB_REPOSITORY" --ref ${input.integrationBranch}`,
		),
		'',
	].join('\n');
