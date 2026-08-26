import type { IProjectAnalysis } from '../../bootstrap/analyze-project';
import type { IMcpToolSurfaceMode } from './surface-mode.interface';

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
	readonly source: 'preset-budget' | 'fallback-budget' | 'plugin-budget';
	/**
	 * r00024 (PRESET-001): which surface the reused preset budget was
	 * measured under. `'estimated'` for the `fallback-budget` source,
	 * where no preset covers the recommendation and there is no
	 * measurement to attribute a surface to.
	 */
	readonly surfaceMode: 'native' | 'adaptive' | 'estimated';
	/** Runtime surface for the reused budget; distinct from measured surface. */
	readonly runtimeSurface?: IMcpToolSurfaceMode;
	readonly note: string;
	/**
	 * f00179 S3: per-plugin `staticBytes` (or legacy `warning`) for
	 * every recommended plugin whose manifest exposes one. Populated
	 * when the cost is reconstructed from the plugin manifests
	 * (`source === 'plugin-budget'`); absent for `preset-budget` and
	 * `fallback-budget` sources.
	 */
	readonly perPluginBytes?: readonly {
		readonly plugin: string;
		readonly bytes: number;
		readonly measuredAt?: string | undefined;
	}[];
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
