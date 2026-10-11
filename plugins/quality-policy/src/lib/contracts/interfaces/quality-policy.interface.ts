export const QUALITY_POLICY_AREAS = [
	'tests',
	'conventions',
	'lint',
	'types',
	'coverage',
] as const;

export type IQualityPolicyArea = (typeof QUALITY_POLICY_AREAS)[number];

export interface IQualityPolicyPresetSignal {
	readonly area: string;
	readonly presetId: string;
	readonly reason: string;
}

export interface IQualityPolicyRoleSample {
	readonly path: string;
	readonly role: string;
}

export interface IQualityPolicyCoverageThreshold {
	readonly lines: number;
	readonly functions: number;
	readonly branches: number;
	readonly statements: number;
}

export interface IQualityPolicyEntry {
	readonly summary: string;
	readonly mode?: string;
	readonly source?: string;
	readonly guidance?: readonly string[];
	readonly runner?: string;
	readonly mockApi?: string;
	readonly evidence?: string;
	readonly scopes?: readonly string[];
	readonly presets?: readonly IQualityPolicyPresetSignal[];
	readonly sampledPaths?: readonly IQualityPolicyRoleSample[];
	readonly roleCounts?: Readonly<Record<string, number>>;
	readonly strict?: boolean;
	readonly exactOptionalPropertyTypes?: boolean;
	readonly noUncheckedIndexedAccess?: boolean;
	readonly noImplicitOverride?: boolean;
	readonly tsconfigChain?: readonly string[];
	readonly coverageThreshold?: IQualityPolicyCoverageThreshold;
	readonly static?: boolean;
}

export interface IQualityPolicyOutput {
	readonly tests?: IQualityPolicyEntry;
	readonly conventions?: IQualityPolicyEntry;
	readonly lint?: IQualityPolicyEntry;
	readonly types?: IQualityPolicyEntry;
	readonly coverage?: IQualityPolicyEntry;
	readonly dependsOn: readonly string[];
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IQualityPolicyPluginOptions {
	readonly maxBytes?: number;
}

export interface IQualityPolicyToolArgs {
	readonly area?: IQualityPolicyArea | undefined;
}

export interface IQualityPolicyToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
}
