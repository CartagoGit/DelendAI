import type {
	PluginDependencyFailureType,
	PluginDependencyLifecycleState,
} from './dependency-graph.interface';

export type PluginLifecyclePhase = 'register' | 'dependency';

export type PluginHookName = 'onToolCall' | 'onToolStart' | 'onToolCancel';

export interface IPluginRegisterErrorInfo {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly phase: PluginLifecyclePhase;
	readonly error: unknown;
	readonly dependencyFailureType?: PluginDependencyFailureType | undefined;
	readonly missingDependencies?: readonly string[] | undefined;
	readonly blockedBy?: readonly string[] | undefined;
	readonly cyclePath?: readonly string[] | undefined;
	readonly lifecycleState?: PluginDependencyLifecycleState | undefined;
}

export interface IPluginHookErrorInfo {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly hookName: PluginHookName;
	readonly toolName: string;
	readonly args: unknown;
	readonly error: unknown;
	readonly elapsedMs?: number | undefined;
}
