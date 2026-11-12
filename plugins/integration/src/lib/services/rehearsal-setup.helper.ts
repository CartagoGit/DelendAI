/**
 * rehearsal-setup.helper.ts — the one setup commit of a rehearsal branch:
 * the integrator workflow, the fast CI, the stand-ins for the scan and for
 * a workflow-token writer, and the project's policy pointed at the branch.
 */
import { parseJsonc, renderLandWorkflow } from '@delendai/core/cli';

import {
	REHEARSAL_CHECKOUT_ACTION,
	REHEARSAL_CI_CHECK,
	REHEARSAL_DIR,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalFileChange,
	IRehearsalSetup,
	IRehearsalSetupInput,
} from '../contracts/interfaces/rehearsal.interface';

import {
	renderRehearsalCiWorkflow,
	renderRehearsalScanWorkflow,
	renderRehearsalTokenWorkflow,
} from './rehearsal-ci-workflow.helper';
import { runLabelPrefix } from './rehearsal-names.helper';

const PASS_INTERVAL_MINUTES = 15;
const WORKFLOWS = '.github/workflows';
const POLICY_PATH = 'delendai.config.json';

/** The project's policy with its integration branch set to the rehearsal branch and the engine on. */
export const rehearsalPolicy = (
	policyText: string,
	integration: string,
): string => {
	const { value, errors } = parseJsonc(policyText);
	if (errors.length > 0 || value === null || typeof value !== 'object')
		throw new Error(
			`${POLICY_PATH} does not parse; the rehearsal will not guess its policy.`,
		);
	const policy = value as Record<string, unknown>;
	const development = (policy.development ?? {}) as Record<string, unknown>;
	const branches = (development.branches ?? {}) as Record<string, unknown>;
	const integrationBlock = (development.integration ?? {}) as Record<
		string,
		unknown
	>;
	return `${JSON.stringify(
		{
			...policy,
			development: {
				...development,
				branches: { ...branches, integration },
				integration: {
					...integrationBlock,
					engine: 'land',
					requiredChecks: [REHEARSAL_CI_CHECK],
				},
			},
		},
		null,
		'\t',
	)}\n`;
};

/** The files of the setup commit for each scenario's integration branch. */
export const createRehearsalSetup = (
	input: IRehearsalSetupInput,
): IRehearsalSetup => ({
	files: (integration): readonly IRehearsalFileChange[] => [
		{
			path: `${WORKFLOWS}/land.yml`,
			content: input.integratorWorkflow(integration),
		},
		{
			path: `${WORKFLOWS}/rehearsal-ci.yml`,
			content: renderRehearsalCiWorkflow({
				integration,
				runId: input.runId,
			}),
		},
		{
			path: `${WORKFLOWS}/rehearsal-scan.yml`,
			content: renderRehearsalScanWorkflow({ integration }),
		},
		{
			path: `${WORKFLOWS}/rehearsal-token.yml`,
			content: renderRehearsalTokenWorkflow({
				integration,
				labelPrefix: runLabelPrefix(input.runId),
				branchPrefix: input.branchPrefix,
			}),
		},
		{
			path: POLICY_PATH,
			content: rehearsalPolicy(input.policyText, integration),
		},
		{
			path: `${REHEARSAL_DIR}/${input.runId}/.keep`,
			content: '',
		},
	],
});

/**
 * Today's land workflow, rendered unchanged onto a rehearsal branch: the
 * rehearsal's own CI is the check it waits on, and no upkeep, promotion or
 * forward sync runs there.
 */
export const landIntegratorWorkflow = (
	integration: string,
	input: { readonly releaseBranch: string; readonly passCommand: string },
): string =>
	renderLandWorkflow({
		integrationBranch: integration,
		releaseBranch: input.releaseBranch,
		checkWorkflows: [REHEARSAL_CI_CHECK],
		cron: `*/${String(PASS_INTERVAL_MINUTES)} * * * *`,
		passCommand: input.passCommand,
		setupSteps: [
			`- uses: ${REHEARSAL_CHECKOUT_ACTION}`,
			'- uses: ./.github/actions/setup-bun-repo',
			'  with:',
			"      fetch-depth: '0'",
		],
	});
