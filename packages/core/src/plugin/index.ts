/**
 * plugin/index.ts — subpath export for @mcp-vertex/core/plugin.
 *
 * r00028 (Track C / §9): the plugin author toolkit — definePlugin,
 * loadPlugins, the contract interfaces. Use this subpath when you
 * are AUTHORING a plugin (instead of consuming the public
 * surface from a host).
 */

export { definePlugin } from '../lib/plugins/plugin-contract';
export type {
	IMcpPlugin,
	IMcpPluginRegistrations,
} from '../lib/plugins/plugin-contract';
export {
	loadPlugins,
	resolvePluginSpecifier,
} from '../lib/plugins/load-plugins';
/**
 * @deprecated r00028 / b00237 — `nodeDynamicImport` is replaced
 * by passing an `importFn` to `loadPlugins` or by using the new
 * `./node` subpath. Will be removed in the next minor release.
 */
export { nodeDynamicImport } from '../lib/plugins/load-plugins';
export { assemblePlugins } from '../lib/cli/assemble-plugins';
export type { IMcpVertexCliArgs } from '../lib/plugins/parse-cli-args';
export { parseCliArgs } from '../lib/plugins/parse-cli-args';
