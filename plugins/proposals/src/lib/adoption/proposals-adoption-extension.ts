import type {
	IAdoptionExtension,
	IAdoptionPlanExtension,
	IApplyAdoptionExtensionInput,
} from '@delendai/core/public';

import { STATUS_TO_FOLDER } from '../contracts/constants/proposal-glossary.constant';
import { buildBootstrapActions } from '../proposals/adopt';

const PROPOSALS_ADOPTION_STEPS: IAdoptionExtension['steps'] = [
	{
		title: 'Sync the proposals registry',
		detail: 'First proposals-plugin boot regenerates the registry index; run `sync_proposals` once if you want to prebuild it immediately.',
		command: 'sync_proposals',
	},
	{
		title: 'Create the first proposal',
		detail: 'Use `create_proposal` to author the first tracked slice once the store is bootstrapped.',
		command: 'create_proposal',
	},
];

const renderStep = (step: IAdoptionExtension['steps'][number]): string =>
	step.command !== undefined
		? `${step.title}: ${step.detail} Command: ${step.command}.`
		: `${step.title}: ${step.detail}`;

const buildProposalStoreFiles = (
	docsDir: string,
): readonly { readonly path: string; readonly content: string }[] =>
	buildBootstrapActions(Object.values(STATUS_TO_FOLDER)).map((action) => ({
		path: `${docsDir}/proposals/${action.rel}`,
		content: action.content,
	}));

const applyPluginConfig = (
	input: IApplyAdoptionExtensionInput,
): {
	readonly config: Record<string, unknown>;
	readonly rationale: readonly string[];
} => {
	const config = structuredClone(input.plan.config) as {
		plugins?: Record<string, { options?: Record<string, unknown> }>;
	};
	config.plugins ??= {};
	config.plugins.proposals ??= { options: {} };
	return {
		config: config as Record<string, unknown>,
		rationale: input.plan.rationale,
	};
};

export const buildProposalsAdoptionExtension = (): IAdoptionPlanExtension => ({
	title: 'Proposals adoption',
	detail: 'Bootstraps the proposals store and wires proposals-aware config only when the proposals plugin is loaded.',
	steps: PROPOSALS_ADOPTION_STEPS,
	applyAdoptionPlan: (input) => {
		// The issues wiring, its launch preset and its steps are the issues
		// plugin's own declaration, applied by the core before this runs.
		const proposalConfig = applyPluginConfig(input);
		return {
			config: proposalConfig.config,
			rationale: proposalConfig.rationale,
			files: [
				...input.plan.files,
				...buildProposalStoreFiles(input.request.docsDir),
			],
			residual: [
				...input.plan.residual,
				...PROPOSALS_ADOPTION_STEPS.map(renderStep),
			],
		};
	},
});
