import type {
	IAdoptionExtension,
	IAdoptionPlanExtension,
	IApplyAdoptionExtensionInput,
} from '@mcp-vertex/core/lib/adopt/adoption-extension-registry';

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

const replaceResidualLine = (
	residual: readonly string[],
	predicate: (line: string) => boolean,
	nextLine: string,
): readonly string[] => {
	let replaced = false;
	const updated = residual.map((line) => {
		if (!predicate(line)) return line;
		replaced = true;
		return nextLine;
	});
	return replaced ? updated : [...updated, nextLine];
};

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
	if (input.request.repo === undefined) {
		return {
			config: config as Record<string, unknown>,
			rationale: input.plan.rationale,
		};
	}
	config.plugins.issues = { options: { repo: input.request.repo } };
	return {
		config: config as Record<string, unknown>,
		rationale: [
			...input.plan.rationale,
			`GitHub issues wired for ${input.request.repo} — the config loads the proposals + issues plugins; launch with --preset full (or --plugins proposals,issues).`,
		],
	};
};

export const buildProposalsAdoptionExtension = (): IAdoptionPlanExtension => ({
	title: 'Proposals adoption',
	detail: 'Bootstraps the proposals store and wires proposals-aware config only when the proposals plugin is loaded.',
	steps: PROPOSALS_ADOPTION_STEPS,
	applyAdoptionPlan: (input) => {
		const proposalConfig = applyPluginConfig(input);
		const withLaunch = replaceResidualLine(
			input.plan.residual,
			(line) => line.startsWith('Launch the host:'),
			`Launch the host: bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset ${
				input.request.repo !== undefined ? 'full' : input.derived.preset
			}`,
		);
		const withIssues =
			input.request.repo !== undefined
				? replaceResidualLine(
						withLaunch,
						(line) => line.startsWith('GitHub repo provided ('),
						`Verify GitHub issues: run \`${input.request.namespacePrefix}_setup_github\` and confirm the ${input.request.repo} tier resolves.`,
					)
				: withLaunch;
		return {
			config: proposalConfig.config,
			rationale: proposalConfig.rationale,
			files: [
				...input.plan.files,
				...buildProposalStoreFiles(input.request.docsDir),
			],
			residual: [
				...withIssues,
				...PROPOSALS_ADOPTION_STEPS.map(renderStep),
			],
		};
	},
});
