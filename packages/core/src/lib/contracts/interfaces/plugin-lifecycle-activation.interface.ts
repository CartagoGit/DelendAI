import type { IMcpPluginRegistrations } from '../../plugins/plugin-contract';
import type { IPluginRuntime } from './plugin-runtime.interface';

/**
 * What a plugin's activation hands back: either the registrations
 * themselves, or a runtime that wraps them and owns their teardown.
 * `definePlugin` accepts both, so every caller downstream has to.
 */
export type IPluginLifecycleActivation =
	| IMcpPluginRegistrations
	| IPluginRuntime<IMcpPluginRegistrations>;
