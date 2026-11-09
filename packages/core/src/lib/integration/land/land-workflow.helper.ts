/**
 * land-workflow.helper.ts — the `land` workflow, rendered from a template
 * and the project's values. This repository commits one instance
 * (`.github/workflows/land.yml`) and a spec keeps it equal to the render;
 * `delendai init` emits the same template for another project.
 *
 * One workflow is the one integration actor: the pass, the promotion that
 * follows the integration branch's CI, the forward sync that follows the
 * release branch, and the upkeep on its schedule. A merge made with the
 * workflow token starts no workflow of its own, so the project's CI
 * listens for this workflow finishing (`workflow_run`) and judges the new
 * tip since the commit the pass started from.
 */

import type { ILandUpkeepStep, ILandWorkflowInput } from './land.interface';

const indent = (lines: readonly string[], by: number): string[] =>
	lines.map((line) => (line === '' ? line : `${' '.repeat(by)}${line}`));

const envLines = (env: Readonly<Record<string, string>>): string[] =>
	Object.keys(env).length === 0
		? []
		: [
				'  env:',
				...Object.entries(env).map(
					([name, value]) => `      ${name}: ${value}`,
				),
			];

const TOKEN_ENV = { GH_TOKEN: '${{ github.token }}' } as const;

/** A job that prepares a runner, then runs `steps`. */
const job = (input: {
	readonly id: string;
	readonly condition: string;
	readonly timeout: number;
	readonly setup: readonly string[];
	readonly steps: readonly string[];
	readonly outputs?: readonly string[];
}): string[] => [
	`    ${input.id}:`,
	`        name: ${input.id}`,
	`        if: \${{ ${input.condition} }}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(input.timeout)}`,
	...(input.outputs === undefined
		? []
		: ['        outputs:', ...indent(input.outputs, 12)]),
	'        steps:',
	...indent(input.setup, 12),
	'',
	...indent(input.steps, 12),
	'',
];

const upkeepStep = (step: ILandUpkeepStep): string[] => [
	`- name: ${step.name}`,
	'  if: always()',
	...envLines({ ...TOKEN_ENV, ...step.env }),
	`  run: ${step.run}`,
];

export const renderLandWorkflow = (input: ILandWorkflowInput): string => {
	const integration = `'${input.integrationBranch}'`;
	const release = `'${input.releaseBranch}'`;
	const passes = `(github.event_name != 'workflow_run' || github.event.workflow_run.event == 'pull_request') && !(github.event_name == 'push' && github.ref_name == ${release})`;
	const jobs: string[] = [
		...job({
			id: 'land',
			condition: passes,
			timeout: 30,
			setup: input.setupSteps,
			steps: [
				'- name: One pass',
				...envLines({
					...TOKEN_ENV,
					GITHUB_REPOSITORY: '${{ github.repository }}',
				}),
				`  run: ${input.passCommand}`,
			],
		}),
	];
	if (input.promotionCommand !== undefined) {
		jobs.push(
			"    # The integration branch's own CI finished: promote it when it is",
			'    # green, file one urgent repair when it is red. It blocks nobody.',
			...job({
				id: 'promote',
				condition: `github.event_name == 'workflow_run' && github.event.workflow_run.event != 'pull_request' && github.event.workflow_run.head_branch == ${integration} && github.event.workflow_run.conclusion != 'skipped'`,
				timeout: 10,
				setup: input.setupSteps,
				steps: [
					'- name: Open the promotion if it is ready, or file its urgent repair',
					...envLines(TOKEN_ENV),
					`  run: ${input.promotionCommand}`,
				],
			}),
		);
	}
	if (input.forwardSyncCommand !== undefined) {
		jobs.push(
			'    # The release branch moved: carry it back into the integration branch.',
			...job({
				id: 'forward-sync',
				condition: `github.event_name == 'push' && github.ref_name == ${release}`,
				timeout: 30,
				setup: input.setupSteps,
				steps: [
					'- name: Carry the release branch back into the integration branch',
					...envLines({
						...TOKEN_ENV,
						GIT_AUTHOR_NAME: 'github-actions[bot]',
						GIT_AUTHOR_EMAIL:
							'41898282+github-actions[bot]@users.noreply.github.com',
						GIT_COMMITTER_NAME: 'github-actions[bot]',
						GIT_COMMITTER_EMAIL:
							'41898282+github-actions[bot]@users.noreply.github.com',
					}),
					`  run: ${input.forwardSyncCommand}`,
				],
			}),
		);
	}
	if (input.upkeep !== undefined && input.upkeep.length > 0) {
		jobs.push(
			'    # Upkeep on the schedule: every step runs, whatever the one before concluded.',
			...job({
				id: 'upkeep',
				condition: `github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`,
				timeout: 15,
				setup: input.setupSteps,
				steps: input.upkeep.flatMap((step, index) => [
					...(index === 0 ? [] : ['']),
					...upkeepStep(step),
				]),
			}),
		);
	}
	return [
		'name: land',
		'',
		'# GENERATED from the land workflow template (renderLandWorkflow); edit the',
		'# project values, not this file. The one integration actor: a stateless',
		'# pass over the ready pull requests (merge what does not overlap, batch',
		'# what does, label the culprit of a red batch), the promotion after the',
		"# integration branch's CI, the forward sync after the release branch moves,",
		'# and the upkeep. It keeps nothing; every pass reads the forge. It exists',
		'# because the policy says `development.integration.engine: land`.',
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
		`        branches: [${input.integrationBranch}, ${input.releaseBranch}]`,
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
		'    issues: write',
		'    checks: read',
		'    actions: write',
		'    security-events: read',
		'',
		'jobs:',
		...jobs,
	]
		.join('\n')
		.replace(/\n\n$/u, '\n');
};
