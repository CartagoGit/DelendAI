import type { IProjectAnalysis } from '../../bootstrap/analyze-project';

export interface IWriteEstimateBreakdownEntry {
	readonly kind: 'config' | 'proposal-store' | 'generated';
	readonly description: string;
	readonly count?: number;
	readonly exact: boolean;
}

export interface IPluginRecommendation {
	readonly id: string;
	readonly recommended: boolean;
	readonly rationale: string;
}

export interface IAssessmentConflict {
	readonly kind: 'existing-surface' | 'write-estimate';
	readonly summary: string;
	readonly severity: 'info' | 'warning';
	readonly count?: number;
	readonly exact: boolean;
	readonly breakdown?: readonly IWriteEstimateBreakdownEntry[];
}

export interface IAssessmentCost {
	readonly presetId: string;
	readonly schemaBytes: number;
	readonly estimatedTokens: number;
	readonly recommendedPluginCount: number;
	readonly source: 'preset-budget' | 'fallback-budget';
	readonly note: string;
}

export interface IAdoptionAssessment {
	readonly recommendedPresetId: string;
	readonly recommendedPluginIds: readonly string[];
	readonly pluginRecommendations: readonly IPluginRecommendation[];
	readonly conflicts: readonly IAssessmentConflict[];
	readonly cost: IAssessmentCost;
	readonly summary: {
		readonly projectType: IProjectAnalysis['projectType'];
		readonly language: IProjectAnalysis['language'];
		readonly packageManager: IProjectAnalysis['packageManager'];
		readonly ciProvider: NonNullable<IProjectAnalysis['ciProvider']>;
		readonly docsConventions: readonly string[];
	};
}

export interface IBuildAdoptionAssessmentOptions {
	readonly projectName?: string;
	readonly namespacePrefix?: string;
	readonly mcpServerName?: string;
	readonly docsDir?: string;
	readonly defaultModel?: string;
	readonly repo?: string;
}
