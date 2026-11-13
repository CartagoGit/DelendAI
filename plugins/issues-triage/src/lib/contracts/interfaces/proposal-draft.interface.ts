import type { ITriageAnalysis } from './analysis.interface';

export interface IBuildProposalDraftInput {
	readonly id: string;
	readonly issueNumber: number;
	readonly issueUrl: string;
	readonly repo: string;
	readonly title: string;
	readonly body: string;
	readonly analysis: ITriageAnalysis;
	readonly date: string;
}
