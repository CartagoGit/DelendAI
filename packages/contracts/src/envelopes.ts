/**
 * envelopes.ts — canonical envelopes that travel over the MCP
 * transport. Core's toolOk and toolError produce these shapes, and a
 * spec in core parses a real tool result with them.
 *
 * r00029 (Track C / §10): pure types only. No runtime, no Node.
 * The discriminated `ok` flag is the canonical pattern across the
 * delendai surface — see `primitives.ts` for the generic
 * `OperationResult`.
 *
 * `ICheckpointAdvisoryEnvelope` (a tool envelope wrapped with its
 * advisories) is gone: no tool produced it and nothing read it. Plugins
 * carry advisories through `IPluginRegistrationBundle.advisories` instead.
 */

/**
 * Envelope every delendai tool returns on success: its payload's fields
 * beside `ok`, as core's `toolOk` builds it.
 */
export type IToolOkEnvelope<T = Record<string, unknown>> = {
	readonly ok: true;
} & T;

// Type aliases, not interfaces: a tool result's structuredContent is a
// Record, and only an alias is assignable to one.

/** What a failure says, as core's `toolError` builds it. */
export type IToolErrorDetail = {
	/** A stable code a caller can branch on instead of the prose. */
	readonly code?: string;
	readonly reason: string;
	readonly nextAction?: string;
};

/** Envelope every delendai tool returns on failure. */
export type IToolErrorEnvelope = {
	readonly ok: false;
	readonly error: IToolErrorDetail;
};

/** Union envelope: the `result` shape of a tool call. */
export type IToolEnvelope<T = unknown> =
	| IToolOkEnvelope<T>
	| IToolErrorEnvelope;

export interface ICheckpointAdvisory {
	readonly id: string;
	readonly severity: 'info' | 'warning' | 'blocker';
	readonly message: string;
	readonly nextAction?: string;
}
