import type { IProposalSummary } from '../catalog/agent-discovery-types';
import {
	emptyWorkflowContributions,
	type IRecommendedNextAction,
	type IStableToolDescriptorContract,
	type IWorkflowContribution,
	type IWorkflowContributionState,
} from '../contracts';

export interface IAssembleWorkflowContributionsInput {
	readonly workspaceRoot: string;
	readonly cacheDir: string;
	readonly corePrefix: string;
	readonly readWorkspaceFile: (
		absolutePath: string,
	) => Promise<string | undefined>;
}

export interface IAssembledWorkflowContributionState
	extends IWorkflowContributionState {
	readonly proposalSummaries: readonly IProposalSummary[];
	readonly recommendedNextActionText: string;
}

type TWorkflowContributionProvider = (
	input: IAssembleWorkflowContributionsInput,
) =>
	| IWorkflowContribution
	| Promise<IWorkflowContribution | undefined>
	| undefined;

type TWorkflowContributionCarrier = IWorkflowContribution & {
	readonly proposalSummaries?: readonly IProposalSummary[];
};

const workflowContributionProviders = new Map<
	string,
	TWorkflowContributionProvider
>();

const freezeStableTool = (
	descriptor: IStableToolDescriptorContract,
): IStableToolDescriptorContract => Object.freeze({ ...descriptor });

const dedupeStableTools = (
	descriptors: readonly IStableToolDescriptorContract[],
): readonly IStableToolDescriptorContract[] => {
	const seenIds = new Set<string>();
	const deduped: IStableToolDescriptorContract[] = [];
	for (const descriptor of descriptors) {
		if (seenIds.has(descriptor.id)) continue;
		seenIds.add(descriptor.id);
		deduped.push(freezeStableTool(descriptor));
	}
	return Object.freeze(deduped);
};

const isProposalSummary = (value: unknown): value is IProposalSummary => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<IProposalSummary>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.title === 'string' &&
		typeof candidate.track === 'string' &&
		typeof candidate.status === 'string' &&
		typeof candidate.kind === 'string'
	);
};

const extractProposalSummaries = (
	contribution: IWorkflowContribution,
): readonly IProposalSummary[] => {
	const carrier = contribution as TWorkflowContributionCarrier;
	if (!Array.isArray(carrier.proposalSummaries)) return [];
	return Object.freeze(carrier.proposalSummaries.filter(isProposalSummary));
};

const buildFallbackRecommendedNextAction = (
	corePrefix: string,
): IRecommendedNextAction => ({
	title: 'Analyze project',
	detail: `Call ${corePrefix}_analyze_project to see what this project needs.`,
	commands: [`${corePrefix}_analyze_project`],
});

const renderRecommendedNextAction = (action: IRecommendedNextAction): string =>
	action.detail;

/** Register or replace one workflow contribution provider. */
export const registerWorkflowContribution = (
	contributor: string,
	provider: TWorkflowContributionProvider,
): void => {
	if (contributor.trim().length === 0) {
		throw new Error(
			'workflow contribution contributor name must not be empty',
		);
	}
	workflowContributionProviders.set(contributor, provider);
};

/** Remove one provider or clear the whole workflow contribution registry. */
export const clearWorkflowContributions = (contributor?: string): void => {
	if (contributor === undefined) {
		workflowContributionProviders.clear();
		return;
	}
	workflowContributionProviders.delete(contributor);
};

/** Test-only helper to restore an empty registry deterministically. */
export const resetWorkflowContributionRegistryForTests = (): void => {
	clearWorkflowContributions();
};

/** Assemble all registered workflow contributions into one generic snapshot. */
export const assembleWorkflowContributions = async (
	input: IAssembleWorkflowContributionsInput,
): Promise<IAssembledWorkflowContributionState> => {
	const fallbackState = emptyWorkflowContributions();
	const providers = [...workflowContributionProviders.values()];
	if (providers.length === 0) {
		const recommendedNextAction = buildFallbackRecommendedNextAction(
			input.corePrefix,
		);
		return {
			...fallbackState,
			proposalSummaries: [],
			recommendedNextAction,
			recommendedNextActionText: renderRecommendedNextAction(
				recommendedNextAction,
			),
		};
	}

	const resolved = (
		await Promise.all(providers.map(async (provider) => provider(input)))
	).filter(
		(contribution): contribution is IWorkflowContribution =>
			contribution !== undefined,
	);
	if (resolved.length === 0) {
		const recommendedNextAction = buildFallbackRecommendedNextAction(
			input.corePrefix,
		);
		return {
			...fallbackState,
			proposalSummaries: [],
			recommendedNextAction,
			recommendedNextActionText: renderRecommendedNextAction(
				recommendedNextAction,
			),
		};
	}

	const recommendedNextAction =
		resolved.find(
			(contribution) => contribution.recommendedNextAction !== undefined,
		)?.recommendedNextAction ??
		buildFallbackRecommendedNextAction(input.corePrefix);
	const summaries = resolved.flatMap((contribution) =>
		contribution.summary === undefined ? [] : [contribution.summary],
	);
	const stableTools = dedupeStableTools(
		resolved.flatMap((contribution) => contribution.stableTools),
	);
	const proposalSummaries = Object.freeze(
		resolved.flatMap((contribution) =>
			extractProposalSummaries(contribution),
		),
	);
	return {
		summaries,
		stableTools,
		proposalSummaries,
		recommendedNextAction,
		recommendedNextActionText: renderRecommendedNextAction(
			recommendedNextAction,
		),
	};
};
