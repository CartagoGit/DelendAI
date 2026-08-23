/**
 * Domain-agnostic checkpoint advisory (f00156).
 *
 * Core knows nothing about proposals, swarms, git, or session hygiene.
 * Plugins compose their own signals and return this envelope; the host
 * injects a triggered advisory onto the tool result so every agent/host
 * surfaces the same user-facing contract.
 *
 * Severity `block` is reserved for objectively invalid transitions a
 * plugin can prove. Core never invents a block from "the session feels
 * long" or "the agent seems confused".
 */
export const CHECKPOINT_ADVISORY_SEVERITIES = [
	'recommend',
	'strong',
	'block',
] as const;

export type CheckpointAdvisorySeverity =
	(typeof CHECKPOINT_ADVISORY_SEVERITIES)[number];

/**
 * Structured advisory a plugin may attach to a tool result. `code` and
 * `nextAction` are opaque strings so domain vocabularies stay in plugins.
 */
export interface ICheckpointAdvisory {
	readonly triggered: boolean;
	readonly code: string;
	readonly severity: CheckpointAdvisorySeverity;
	readonly message: string;
	readonly reason: string;
	readonly nextAction: string;
	readonly dedupeKey: string;
}

/** Context handed to plugin advisory hooks for the current tool call. */
export interface ICheckpointAdvisoryContext {
	readonly toolName: string;
	readonly args: unknown;
}

/**
 * Optional plugin/host hook: observe the call and optionally return a
 * triggered advisory. Returning `null` / `triggered:false` is a no-op.
 */
export type CheckpointAdvisoryProvider = (
	context: ICheckpointAdvisoryContext,
) => ICheckpointAdvisory | null | undefined;

/**
 * Optional pre-handler hook. When the merged result has
 * `severity: 'block'`, the core short-circuits the tool handler.
 */
export type BeforeToolCallHook = (
	context: ICheckpointAdvisoryContext,
) => ICheckpointAdvisory | null | undefined;
