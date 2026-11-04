/**
 * plugin-tool-name.helper.ts — the name the server registers a plugin's
 * tool under, from one rule.
 *
 * A plugin's tools are named `<core prefix>_<plugin prefix>_<tool id>`,
 * where the plugin prefix is the one the project configures for it, or
 * the plugin's id. The eager assembly, the managed-lazy surface and the
 * text a plugin writes for an agent all spell names this way; when each
 * spelled it by hand, a plugin's plan told agents to call `logs_query`,
 * a name no server registers.
 */
import type { IDelendaiConfigFile } from './load-config-file';
import { pluginConfigFor } from './load-config-file';

/** The prefix a plugin's tools carry under the core prefix. */
export const pluginNamespaceFor = (
	config: IDelendaiConfigFile,
	pluginId: string,
): string => pluginConfigFor(config, pluginId).prefix ?? pluginId;

/** The registered name of a tool, given its plugin's namespace. */
export const pluginToolName = (
	corePrefix: string,
	namespace: string,
	toolId: string,
): string => `${corePrefix}_${namespace}_${toolId}`;
