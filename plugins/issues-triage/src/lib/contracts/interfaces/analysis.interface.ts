export type TriageCategory = 'bug' | 'feature' | 'docs' | 'question' | 'other';

export type TriageSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ITriageAnalysis {
	readonly category: TriageCategory;
	readonly severity: TriageSeverity;
	readonly keywords: readonly string[];
	readonly summary: string;
}
