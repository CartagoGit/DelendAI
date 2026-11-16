/**
 * rehearsal-setup.helper.ts — the one setup commit of a rehearsal branch:
 * the integrator workflow and its signal, the fast CI, the stand-ins for the scan and for
 * a workflow-token writer, and the project's policy pointed at the branch.
 */
import {
	LAND_SIGNAL_WORKFLOW_FILE,
	parseJsonc,
	landWorkflowInputOf,
	renderLandSignalWorkflow,
	renderLandWorkflow,
	type ILandWorkflowIdentity,
} from '@delendai/core/cli';

import {
	REHEARSAL_CHECKOUT_ACTION,
	REHEARSAL_CI_CHECK,
	REHEARSAL_DIR,
	REHEARSAL_OVERLAP_FILE,
	rehearsalOverlapContent,
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
import { realModeFiles } from './rehearsal-real-ci.service';
import { realWorkflowNames } from './rehearsal-scan.helper';
import {
	runBranchRoot,
	runLabelPrefix,
	runPublicationPrefix,
	scenarioLandGroup,
} from './rehearsal-names.helper';

const requireProjectIntegration = (input: IRehearsalSetupInput): string => {
	if (input.projectIntegration === undefined)
		throw new Error(
			'a real-mode setup needs the project integration branch name',
		);
	return input.projectIntegration;
};

const PASS_INTERVAL_MINUTES = 15;
const WORKFLOWS = '.github/workflows';
const POLICY_PATH = 'delendai.config.json';

const derivedPathsOf = (block: Record<string, unknown>): string[] =>
	Array.isArray(block.paths) ? (block.paths as string[]) : [];

/** The project's policy with its integration branch set to the rehearsal branch and the engine on. */
export const rehearsalPolicy = (
	policyText: string,
	integration: string,
	keepRequiredChecks = false,
	runId?: string,
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
	const derivedBlock = (integrationBlock.derived ?? {}) as Record<
		string,
		unknown
	>;
	return `${JSON.stringify(
		{
			...policy,
			development: {
				...development,
				branches: {
					...branches,
					integration,
					// The run's heads are its publications: the project's head-shape
					// lint reads this from the policy of the base it runs for.
					...(runId === undefined
						? {}
						: {
								publicationRefPrefix:
									runPublicationPrefix(integration),
							}),
				},
				integration: {
					...integrationBlock,
					engine: 'land',
					// The pass batches what overlaps; the harness does not turn it off.
					batching: 'overlap',
					...(runId === undefined
						? {}
						: {
								// The one file the derived-conflict scenario collides on is
								// derived here, and regenerating it has nothing to run.
								derived: {
									...derivedBlock,
									paths: [
										...derivedPathsOf(derivedBlock),
										`${REHEARSAL_DIR}/${runId}/derived-conflict-a.txt`,
									],
									command: '',
								},
							}),
					...(keepRequiredChecks
						? {}
						: { requiredChecks: [REHEARSAL_CI_CHECK] }),
				},
			},
		},
		null,
		'\t',
	)}\n`;
};

/**
 * The checks branch protection requires on a head: the stand-in's check, or
 * in real mode the ones the project's policy names.
 */
export const requiredChecksOf = (input: IRehearsalSetupInput): string[] => {
	if (input.realWorkflows === undefined) return [REHEARSAL_CI_CHECK];
	const policy = parseJsonc(input.policyText).value as {
		development?: { integration?: { requiredChecks?: unknown } };
	} | null;
	const names = policy?.development?.integration?.requiredChecks;
	return Array.isArray(names)
		? names.filter((name): name is string => typeof name === 'string')
		: [];
};

/** The files of the setup commit for each scenario's integration branch. */
export const createRehearsalSetup = (
	input: IRehearsalSetupInput,
): IRehearsalSetup => ({
	requiredChecks: requiredChecksOf(input),
	...(input.realWorkflows === undefined
		? {}
		: { workflows: realWorkflowNames(input.realWorkflows) }),
	files: async (integration) => {
		const all = fastFiles(input, integration);
		if (input.realWorkflows === undefined) return all;
		const real = realFiles(input, integration, all);
		return hasSetupCommand(input) ? withSetupCommand(input, real) : real;
	},
});

const hasSetupCommand = (input: IRehearsalSetupInput): boolean =>
	input.setupCommand !== undefined && input.setupCommand !== '';

/** The rehearsal's files, then those the policy's setup command changed over them (it wins on a path both write). */
const withSetupCommand = async (
	input: IRehearsalSetupInput,
	files: readonly IRehearsalFileChange[],
): Promise<readonly IRehearsalFileChange[]> => {
	if (input.materialise === undefined)
		throw new Error(
			`the setup command \`${input.setupCommand ?? ''}\` has no worktree to run in`,
		);
	const changed = await input.materialise(input.setupCommand ?? '', files);
	const written = new Set(changed.map((file) => file.path));
	return [...files.filter((file) => !written.has(file.path)), ...changed];
};

/** Real mode: the project's CI and scans replace the fast stand-ins, and no workflow-token writer is rendered. */
const realFiles = (
	input: IRehearsalSetupInput,
	integration: string,
	all: readonly IRehearsalFileChange[],
): readonly IRehearsalFileChange[] => {
	const stand = new Set([
		`${WORKFLOWS}/rehearsal-ci.yml`,
		`${WORKFLOWS}/rehearsal-scan.yml`,
		`${WORKFLOWS}/rehearsal-token.yml`,
		POLICY_PATH,
	]);
	return [
		...all.filter((file) => !stand.has(file.path)),
		...realModeFiles({
			integration,
			projectIntegration: requireProjectIntegration(input),
			workflows: input.realWorkflows ?? {},
		}),
		{
			path: POLICY_PATH,
			content: rehearsalPolicy(
				input.policyText,
				integration,
				true,
				input.runId,
			),
		},
	];
};

const fastFiles = (
	input: IRehearsalSetupInput,
	integration: string,
): readonly IRehearsalFileChange[] => [
	{
		path: `${WORKFLOWS}/land.yml`,
		content: input.integratorWorkflow(
			integration,
			scenarioLandGroup(input.runId, integration),
		),
	},
	{
		path: `${WORKFLOWS}/${LAND_SIGNAL_WORKFLOW_FILE}`,
		content: renderLandSignalWorkflow({ integrationBranch: integration }),
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
			branchPrefix: runBranchRoot(input.branchPrefix, input.runId),
		}),
	},
	{
		path: POLICY_PATH,
		content: rehearsalPolicy(
			input.policyText,
			integration,
			false,
			input.runId,
		),
	},
	{
		path: `${REHEARSAL_DIR}/${input.runId}/.keep`,
		content: '',
	},
	{ path: REHEARSAL_OVERLAP_FILE, content: rehearsalOverlapContent() },
];

/**
 * Today's land workflow, rendered unchanged onto a rehearsal branch: the
 * rehearsal's own CI is the check it waits on, and no upkeep, promotion or
 * forward sync runs there.
 */
export const landIntegratorWorkflow = (
	integration: string,
	concurrencyGroup: string,
	input: {
		readonly releaseBranch: string;
		readonly passCommand: string;
		readonly identity: ILandWorkflowIdentity;
	},
): string =>
	renderLandWorkflow({
		...landWorkflowInputOf(
			{
				integrationBranch: integration,
				releaseBranch: input.releaseBranch,
				passCommand: input.passCommand,
				concurrencyGroup,
				setupSteps: [
					`- uses: ${REHEARSAL_CHECKOUT_ACTION}`,
					'  with:',
					'      persist-credentials: false',
					'- uses: ./.github/actions/setup-bun-repo',
					'  with:',
					"      fetch-depth: '0'",
					"      persist-credentials: 'false'",
				],
			},
			{
				identity: input.identity,
				cron: `*/${String(PASS_INTERVAL_MINUTES)} * * * *`,
			},
		),
	});
