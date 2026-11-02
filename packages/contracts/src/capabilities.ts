/**
 * capabilities.ts — effect-capability types.
 *
 * r00029 (Track C / §10): pure types describing the
 * permission/effect vocabulary that MCP tools declare and
 * consumers negotiate against. No runtime, no Node imports.
 */

import type { PluginId } from './primitives';

/**
 * Effect capabilities a tool can declare. The exact set lives in
 * the runtime (`packages/core`); this file only mirrors the
 * string-literal union so consumers can type-narrow against it
 * without pulling the runtime in.
 */
export type EffectCapability =
	| 'filesystem-read'
	| 'filesystem-write'
	| 'git-read'
	| 'git-write'
	| 'network-read'
	| 'network-write'
	| 'process-spawn'
	| 'mcp-server';

/** Set of capabilities a tool advertises. */
export interface ICapabilitySet {
	readonly effects: readonly EffectCapability[];
}

/** Capability advertised by a plugin (plugin-level, not tool-level). */
export interface IPluginCapability {
	readonly pluginId: PluginId;
	readonly capabilities: readonly EffectCapability[];
}
