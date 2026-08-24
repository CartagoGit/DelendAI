export interface IPresetBudgetMetric {
	readonly value: number;
	readonly source: 'measured-runtime';
	readonly measuredAt: string;
}

export interface IPresetTokenEstimate {
	readonly value: number;
	readonly source: 'estimated-from-schema-bytes';
	readonly measuredAt: string;
	readonly bytesPerEstimatedToken: number;
}

export interface IPresetBudgetStringList {
	readonly source: 'measured-tool-effects' | 'role-profile';
	readonly values: readonly string[];
}

export interface IPresetBudgetProfile {
	readonly toolCount: IPresetBudgetMetric;
	readonly schemaBytes: IPresetBudgetMetric;
	readonly coldStartTokens: IPresetTokenEstimate;
	readonly permissions: IPresetBudgetStringList;
	readonly capabilities: IPresetBudgetStringList;
}

export interface IPresetMetadataEntry {
	readonly role: string;
	readonly budget: IPresetBudgetProfile;
}
