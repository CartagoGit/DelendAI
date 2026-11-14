/**
 * land-workflow.helper.ts — the `land` workflow, rendered from a template
 * and the project's values. This repository commits one instance
 * (`.github/workflows/land.yml`) and a spec keeps it equal to the render;
 * `delendai init` emits the same template for another project.
 *
 * One workflow is the one integration actor: the pass, the promotion that
 * follows the integration branch's CI, the forward sync that follows the
 * release branch, and the upkeep on its schedule. It acts as the project's
 * identity (a GitHub App's installation token, or a personal access token),
 * because a push or merge made with the workflow token starts no workflow.
 * The workflow token is never used: nothing here writes through it.
 *
 * It wakes on events only: a pull request event on the integration branch,
 * a push to it, and a dispatch from the CI's last job. The schedule is a
 * watchdog on the default branch: any work it finds was a missed event.
 */

import type {
	ILandUpkeepStep,
	ILandWorkflowIdentity,
	ILandWorkflowInput,
} from './land.interface';
import { LAND_WORKFLOW_NAME } from './land.constant';

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

const IDENTITY_STEP_ID = 'identity';
const APP_TOKEN_ACTION =
	'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0';
const UPLOAD_ARTIFACT =
	'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7';
const DOWNLOAD_ARTIFACT =
	'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8';
const DERIVED_ARTIFACT = 'derived-result';
const PULL_REQUEST_EVENTS = [
	'opened',
	'reopened',
	'synchronize',
	'ready_for_review',
	'labeled',
	'unlabeled',
	'converted_to_draft',
	'closed',
] as const;

/** The step that mints the identity's token, when the identity needs one. */
export const identitySteps = (identity: ILandWorkflowIdentity): string[] =>
	identity.kind === 'app'
		? [
				'- name: Mint the integrator identity token',
				`  id: ${IDENTITY_STEP_ID}`,
				`  uses: ${APP_TOKEN_ACTION}`,
				'  with:',
				`      app-id: \${{ vars.${identity.appIdVariable} }}`,
				`      private-key: \${{ secrets.${identity.keySecret} }}`,
				'',
			]
		: [];

/** The token every write uses: the identity's, never `github.token`. */
export const tokenOf = (identity: ILandWorkflowIdentity): string =>
	identity.kind === 'app'
		? `\${{ steps.${IDENTITY_STEP_ID}.outputs.token }}`
		: `\${{ secrets.${identity.tokenSecret} }}`;

/** A job that mints the identity, prepares a runner, then runs `steps`. */
const job = (
	input: {
		readonly id: string;
		readonly condition: string;
		readonly timeout: number;
		readonly setup: readonly string[];
		readonly steps: readonly string[];
	},
	identity: ILandWorkflowIdentity,
): string[] => [
	`    ${input.id}:`,
	`        name: ${input.id}`,
	`        if: \${{ ${input.condition} }}`,
	'        runs-on: ubuntu-latest',
	`        timeout-minutes: ${String(input.timeout)}`,
	'        steps:',
	...indent(identitySteps(identity), 12),
	...indent(input.setup, 12),
	'',
	...indent(input.steps, 12),
	'',
];

const upkeepStep = (
	step: ILandUpkeepStep,
	token: Readonly<Record<string, string>>,
): string[] => [
	`- name: ${step.name}`,
	'  if: always()',
	...envLines({ ...token, ...step.env }),
	`  run: ${step.run}`,
];

export const renderLandWorkflow = (input: ILandWorkflowInput): string => {
	const release = `'${input.releaseBranch}'`;
	const token = { GH_TOKEN: tokenOf(input.identity) };
	const dispatched = (flag: string): string =>
		`github.event_name == 'workflow_dispatch' && inputs.${flag} != ''`;
	const derivedDispatch =
		input.derived === undefined ? [] : [dispatched('derived')];
	const passes = [
		`!(github.event_name == 'workflow_dispatch' && inputs.promote != '')`,
		...derivedDispatch.map((d) => `!(${d})`),
		`!(github.event_name == 'push' && github.ref_name == ${release})`,
	].join(' && ');
	const jobs: string[] = [
		'    # A pull request event, a push to the integration branch, or the CI of a',
		'    # pull request ending: re-read the forge and settle every pull request.',
		'    # On the schedule the same pass is the watchdog: work found there was a',
		'    # missed event, so it fails and files the evidence.',
		...job(
			{
				id: 'land',
				condition: passes,
				timeout: 30,
				setup: input.setupSteps,
				steps: [
					'- name: One pass',
					...envLines({
						...token,
						GITHUB_REPOSITORY: '${{ github.repository }}',
						LAND_WATCHDOG: `\${{ github.event_name == 'schedule' && '1' || '' }}`,
					}),
					`  run: ${input.passCommand}`,
					'',
					'- name: File the evidence of a missed event',
					`  if: \${{ failure() && github.event_name == 'schedule' }}`,
					...envLines({ ...token, RUN: '${{ github.run_id }}' }),
					'  run: >-',
					'      gh issue create --repo "${GITHUB_REPOSITORY}"',
					'      --title "The watchdog found work no event had started"',
					'      --body "The scheduled pass acted, so an event was missed. Run ${RUN}."',
				],
			},
			input.identity,
		),
	];
	if (input.derived !== undefined) {
		const { prepareCommand, pushCommand } = input.derived;
		jobs.push(
			'    # A derived-file conflict, in two jobs. This one holds no token: it',
			"    # runs the pull request's code, so it can only read, and hands its",
			'    # result over as an artifact.',
			'    derived-prepare:',
			'        name: derived-prepare',
			`        if: \${{ ${dispatched('derived')} }}`,
			'        runs-on: ubuntu-latest',
			'        timeout-minutes: 30',
			'        permissions:',
			'            contents: read',
			'        steps:',
			...indent(input.setupSteps, 12),
			'',
			'            - name: Merge the integration branch and regenerate',
			'              env:',
			'                  DERIVED_PR: ${{ inputs.derived }}',
			`              run: ${prepareCommand}`,
			'',
			'            - name: Hand the result over',
			`              uses: ${UPLOAD_ARTIFACT}`,
			'              with:',
			`                  name: ${DERIVED_ARTIFACT}`,
			'                  path: derived-out',
			'',
			"    # This one holds the identity and runs none of the pull request's code:",
			'    # it checks the artifact against its own merge and pushes, without force.',
			...job(
				{
					id: 'derived-push',
					condition: dispatched('derived'),
					timeout: 10,
					setup: input.setupSteps,
					steps: [
						'- name: Fetch the result',
						`  uses: ${DOWNLOAD_ARTIFACT}`,
						'  with:',
						`      name: ${DERIVED_ARTIFACT}`,
						'      path: derived-out',
						'',
						'- name: Push it if the head did not move',
						...envLines({
							...token,
							GITHUB_REPOSITORY: '${{ github.repository }}',
							DERIVED_PR: '${{ inputs.derived }}',
						}),
						`  run: ${pushCommand}`,
					],
				},
				input.identity,
			).map((line) =>
				line === '        runs-on: ubuntu-latest'
					? `${line}\n        needs: derived-prepare`
					: line,
			),
		);
	}
	if (input.promotionCommand !== undefined) {
		jobs.push(
			'    # The CI of the integration branch ended: promote it when it is green,',
			'    # file one urgent repair when it is red. It blocks nobody.',
			...job(
				{
					id: 'promote',
					condition: dispatched('promote'),
					timeout: 10,
					setup: input.setupSteps,
					steps: [
						'- name: Open the promotion if it is ready, or file its urgent repair',
						...envLines(token),
						`  run: ${input.promotionCommand}`,
					],
				},
				input.identity,
			),
		);
	}
	if (input.forwardSyncCommand !== undefined) {
		jobs.push(
			'    # The release branch moved: carry it back into the integration branch.',
			...job(
				{
					id: 'forward-sync',
					condition: `github.event_name == 'push' && github.ref_name == ${release}`,
					timeout: 30,
					setup: input.setupSteps,
					steps: [
						'- name: Carry the release branch back into the integration branch',
						...envLines({
							...token,
							GIT_AUTHOR_NAME: 'delendai-integrator',
							GIT_AUTHOR_EMAIL:
								'integrator@users.noreply.github.com',
							GIT_COMMITTER_NAME: 'delendai-integrator',
							GIT_COMMITTER_EMAIL:
								'integrator@users.noreply.github.com',
						}),
						`  run: ${input.forwardSyncCommand}`,
					],
				},
				input.identity,
			),
		);
	}
	if (input.upkeep !== undefined && input.upkeep.length > 0) {
		jobs.push(
			'    # Upkeep on the schedule: every step runs, whatever the one before concluded.',
			...job(
				{
					id: 'upkeep',
					condition: `github.event_name == 'schedule'`,
					timeout: 15,
					setup: input.setupSteps,
					steps: input.upkeep.flatMap((step, index) => [
						...(index === 0 ? [] : ['']),
						...upkeepStep(step, token),
					]),
				},
				input.identity,
			),
		);
	}
	return [
		`name: ${LAND_WORKFLOW_NAME}`,
		'',
		'# GENERATED from the land workflow template (renderLandWorkflow); edit the',
		'# project values, not this file. The one integration actor: a stateless',
		'# pass over the ready pull requests (merge what does not overlap, batch',
		'# what does, label the culprit of a red batch), the promotion after the',
		"# integration branch's CI, the forward sync after the release branch moves,",
		'# and the upkeep. It keeps nothing; every pass reads the forge. It acts as',
		'# the identity the policy names and never as the workflow token. It exists',
		'# because the policy says `development.integration.engine: land`.',
		'',
		'on:',
		'    pull_request_target:',
		`        types: [${PULL_REQUEST_EVENTS.join(', ')}]`,
		`        branches: [${input.integrationBranch}]`,
		'    push:',
		`        branches: [${input.integrationBranch}, ${input.releaseBranch}]`,
		'    schedule:',
		`        - cron: '${input.cron}'`,
		'    workflow_dispatch:',
		'        inputs:',
		'            pr:',
		'                description: The pull request whose CI ended; the pass reads them all.',
		'                required: false',
		"                default: ''",
		...(input.derived === undefined
			? []
			: [
					'            derived:',
					'                description: The pull request whose derived files conflict with the integration branch.',
					'                required: false',
					"                default: ''",
				]),
		'            promote:',
		'                description: Set when the integration branch CI ended green or red.',
		'                required: false',
		"                default: ''",
		'',
		'# Concurrency 1; a waiting pass is kept, since the next reads what the',
		'# cancelled one would have.',
		'concurrency:',
		`    group: ${input.concurrencyGroup ?? LAND_WORKFLOW_NAME}`,
		'    cancel-in-progress: false',
		'',
		'# The workflow token only reads; every write uses the identity.',
		'permissions:',
		'    contents: read',
		'    pull-requests: read',
		'    checks: read',
		'    actions: read',
		'',
		'jobs:',
		...jobs,
	]
		.join('\n')
		.replace(/\n\n$/u, '\n');
};
