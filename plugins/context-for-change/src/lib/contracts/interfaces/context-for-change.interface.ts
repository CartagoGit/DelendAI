export const CONTEXT_FOR_CHANGE_SOURCES = [
	'git',
	'symbols',
	'references',
	'tests',
	'docs',
	'conventions',
	'test-policy',
	'memory',
] as const;

export type TContextForChangeSource =
	(typeof CONTEXT_FOR_CHANGE_SOURCES)[number];

export interface IContextForChangePluginOptions {
	readonly maxBytes?: number;
	readonly docsRoots?: readonly string[];
	readonly memoryStorePath?: string;
	readonly testPolicyMode?: 'tdd' | 'tests-after' | 'free' | 'none';
}

export interface IContextForChangeToolArgs {
	readonly files?: readonly string[] | undefined;
	readonly gitDiff?: string | undefined;
	readonly symbol?: string | undefined;
	readonly task?: string | undefined;
}

export interface IContextForChangeSection {
	readonly source: TContextForChangeSource;
	readonly summary: string;
}

export interface IContextForChangeOutput {
	readonly dependsOn: readonly string[];
	readonly files: readonly string[];
	readonly sections: readonly IContextForChangeSection[];
	readonly bytes: number;
	readonly truncated: boolean;
	readonly originalBytes?: number;
}

export interface IContextForChangeToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly maxBytes: number;
	readonly docsRoots?: readonly string[];
	readonly memoryStorePath?: string;
	readonly testPolicyMode?: 'tdd' | 'tests-after' | 'free' | 'none';
}
