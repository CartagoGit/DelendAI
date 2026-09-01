/**
 * plugin.ts — types describing how a plugin registers with the
 * mcp-vertex host.
 *
 * r00029 (Track C / §10): pure types only.
 */

import type { ICapabilitySet } from './capabilities';
import type { ICheckpointAdvisory, IToolEnvelope } from './envelopes';
import type {
	IsoTimestamp,
	NonEmptyString,
	OperationResult,
	PluginId,
} from './primitives';
import type { ISafetyBlock } from './safety';

/**
 * Manifest a plugin exposes at load time. The runtime in
 * `@mcp-vertex/core` reads this; the type lives here so external
 * tool authors can type-check their plugin code without pulling
 * the core runtime in.
 */
export interface IPluginManifest {
	readonly id: PluginId;
	readonly version: NonEmptyString;
	readonly description: string;
	readonly capabilities: ICapabilitySet;
}

/** Lifecycle phase the plugin currently sits in. */
export type PluginLifecyclePhase =
	| 'unloaded'
	| 'loaded'
	| 'hidden'
	| 'active'
	| 'denied';

/** State machine for a plugin's lifecycle. */
export interface IPluginLifecycle {
	readonly phase: PluginLifecyclePhase;
	readonly since: IsoTimestamp;
	readonly reason?: string;
}

/** Tool registration entry. */
export interface IToolRegistrationShape {
	readonly id: NonEmptyString;
	readonly summary: string;
	readonly tags: readonly string[];
}

/** Prompt registration entry. */
export interface IPromptRegistrationShape {
	readonly id: NonEmptyString;
	readonly description: string;
}

/** Resource registration entry. */
export interface IResourceRegistrationShape {
	readonly id: NonEmptyString;
	readonly uri: string;
}

/** Bundle a plugin registers with the host. */
export interface IPluginRegistrationBundle {
	readonly manifest: IPluginManifest;
	readonly tools: readonly IToolRegistrationShape[];
	readonly prompts: readonly IPromptRegistrationShape[];
	readonly resources: readonly IResourceRegistrationShape[];
}

/** Outcome of a plugin invocation, including optional safety blocks. */
export type IPluginInvocationResult =
	| IToolEnvelope<unknown>
	| { readonly blocked: true; readonly safety: ISafetyBlock };

/** Helper alias for callers that prefer a discriminated union with no advisory. */
export type InvocationOutcome<T> = OperationResult<T> & {
	readonly advisories?: readonly ICheckpointAdvisory[];
};
