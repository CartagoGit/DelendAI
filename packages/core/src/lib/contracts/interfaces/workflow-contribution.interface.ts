/**
 * Generic workflow contribution contracts for pluggable providers.
 */

export interface IWorkflowSummaryMetric {
	readonly label: string;
	readonly value: number;
}

export interface IWorkflowSummary {
	readonly title: string;
	readonly detail: string;
	readonly metrics?: ReadonlyArray<IWorkflowSummaryMetric>;
}

export interface IStableToolDescriptorContract {
	readonly id: string;
	readonly title: string;
	readonly detail: string;
}

export interface IRecommendedNextAction {
	readonly title: string;
	readonly detail: string;
	readonly commands?: readonly string[];
	readonly files?: readonly string[];
}

export interface IWorkflowContribution {
	readonly summary?: IWorkflowSummary;
	readonly stableTools: readonly IStableToolDescriptorContract[];
	readonly recommendedNextAction?: IRecommendedNextAction;
}

export interface IWorkflowContributionState {
	readonly summaries: readonly IWorkflowSummary[];
	readonly stableTools: readonly IStableToolDescriptorContract[];
	readonly recommendedNextAction: IRecommendedNextAction;
}

/** Safe fallback when no provider contributes workflow data. */
export function emptyWorkflowContributions(): IWorkflowContributionState {
	return {
		summaries: [],
		stableTools: [],
		recommendedNextAction: {
			title: 'No workflow contributions available',
			detail: 'No provider reported workflow data.',
		},
	};
}
