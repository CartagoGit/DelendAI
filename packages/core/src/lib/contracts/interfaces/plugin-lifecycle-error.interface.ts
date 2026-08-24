export type PluginLifecyclePhase = 'register' | 'dependency';

export type PluginHookName = 'onToolCall' | 'onToolStart' | 'onToolCancel';

export interface IPluginRegisterErrorInfo {
	readonly pluginName: string;
	readonly resolvedSpecifier: string;
	readonly phase: PluginLifecyclePhase;
	readonly error: unknown;
	readonly missingDependencies?: readonly string[] | undefined;
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
