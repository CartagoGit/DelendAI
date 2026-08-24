export const PROJECT_HEALTH_DOMAINS = [
	'summary',
	'security',
	'deps',
	'quality',
	'debt',
] as const;

export type TProjectHealthDomain = (typeof PROJECT_HEALTH_DOMAINS)[number];

export interface IProjectHealthScore {
	readonly score: number;
	readonly security: number;
	readonly deps: number;
	readonly quality: number;
	readonly debt: number;
}

export interface IProjectHealthSignals {
	readonly lockfile: string | undefined;
	readonly qualityScopes: readonly string[];
	readonly lintConfig: boolean;
	readonly testConfig: boolean;
	readonly suspiciousPaths: readonly string[];
	readonly markerCount: number;
	readonly sampledFiles: number;
	readonly score: IProjectHealthScore;
}

export interface IProjectHealthNextAction {
	readonly tool: string;
	readonly reason: string;
}

export interface IProjectHealthSummary extends IProjectHealthScore {
	readonly next: readonly IProjectHealthNextAction[];
	readonly dependsOn: readonly string[];
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IProjectHealthOutput {
	readonly score?: number;
	readonly security?: number;
	readonly deps?: number;
	readonly quality?: number;
	readonly debt?: number;
	readonly next?: readonly IProjectHealthNextAction[];
	readonly domain?: TProjectHealthDomain;
	readonly tool?: string;
	readonly hint?: string;
	readonly dependsOn?: readonly string[];
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IProjectHealthPluginOptions {
	readonly maxBytes?: number;
}

export interface IProjectHealthToolArgs {
	readonly domain?: TProjectHealthDomain | undefined;
}

export interface IProjectHealthToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
}
