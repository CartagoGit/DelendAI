/**
 * plugin/index.ts — subpath export for @delendai/core/plugin.
 *
 * r00028 (Track C / §9): the plugin author toolkit — definePlugin,
 * loadPlugins, the contract interfaces. Use this subpath when you
 * are AUTHORING a plugin (instead of consuming the public
 * surface from a host).
 */

// A plugin that persists work refs has to reject an unsafe pathspec
// before git ever sees it. The validator belongs with the plugin author
// toolkit rather than the host surface: only plugin code calls it.
export { validateScopePaths } from '../lib/wip-engine/scope';
export type {
	IInvalidScopePath,
	IScopeValidation,
} from '../lib/wip-engine/scope.interface';
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
export type { IDelendaiCliArgs } from '../lib/plugins/parse-cli-args';
export { parseCliArgs } from '../lib/plugins/parse-cli-args';
// Authoring a tool that answers through `toolOk`: declare the payload,
// wrap it at registration, and the `ok` envelope can never be forgotten.
export { withOkEnvelope } from '../lib/shared/with-ok-envelope.helper';
// Every place that tells an agent how to isolate its work derives the
// advice from the resolved policy, so it cannot contradict it.
export { describeWorkIsolation } from '../lib/development-policy/work-isolation';
export type { IWorkIsolation } from '../lib/contracts/interfaces/work-isolation.interface';
