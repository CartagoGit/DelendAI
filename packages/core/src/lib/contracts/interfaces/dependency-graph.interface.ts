export type PluginDependencyLifecycleState =
	| 'discovered'
	| 'resolved'
	| 'validated'
	| 'registering'
	| 'active'
	| 'failed'
	| 'blocked'
	| 'disposed';

export type PluginDependencyFailureType =
	| 'missing'
	| 'failed'
	| 'blocked'
	| 'cycle';

export interface IDependencyGraphPluginInput {
	readonly name: string;
	readonly specifier: string;
	readonly resolvedSpecifier: string;
	readonly dependsOn?: readonly string[];
	readonly initialState?: PluginDependencyLifecycleState | undefined;
}

export interface IDependencyGraphMissingDependency {
	readonly plugin: string;
	readonly missing: readonly string[];
}

export interface IDependencyGraphCycle {
	readonly path: readonly string[];
	readonly plugins: readonly string[];
	readonly message: string;
}

export interface IDependencyGraphNode {
	readonly name: string;
	readonly specifier: string;
	readonly resolvedSpecifier: string;
	readonly dependsOn: readonly string[];
	readonly dependents: readonly string[];
	readonly state: PluginDependencyLifecycleState;
	readonly blockedBy?: readonly string[] | undefined;
}

export interface IDependencyGraphSnapshot {
	readonly order: readonly string[];
	readonly nodes: Readonly<Record<string, IDependencyGraphNode>>;
	readonly missingDependencies: readonly IDependencyGraphMissingDependency[];
	readonly cycle?: IDependencyGraphCycle | undefined;
}

export interface IBlockDependentsResult {
	readonly graph: IDependencyGraphSnapshot;
	readonly blocked: readonly IDependencyGraphNode[];
}
