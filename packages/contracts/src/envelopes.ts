/**
 * envelopes.ts — canonical envelopes that travel over the MCP
 * transport.
 *
 * r00029 (Track C / §10): pure types only. No runtime, no Node.
 * The discriminated `ok` flag is the canonical pattern across the
 * mcp-vertex surface — see `primitives.ts` for the generic
 * `OperationResult`.
 */

import type { IOperationError } from './primitives';

/** Envelope returned by every mcp-vertex tool on success. */
export interface IToolOkEnvelope<T = unknown> {
	readonly ok: true;
	readonly value: T;
}

/** Envelope returned by every mcp-vertex tool on failure. */
export interface IToolErrorEnvelope {
	readonly ok: false;
	readonly error: IOperationError;
}

/** Union envelope: the `result` shape of a tool call. */
export type IToolEnvelope<T = unknown> =
	| IToolOkEnvelope<T>
	| IToolErrorEnvelope;

/** Envelope that wraps a tool envelope with checkpoint advisories. */
export interface ICheckpointAdvisoryEnvelope<T = unknown> {
	readonly result: IToolEnvelope<T>;
	readonly advisories: readonly ICheckpointAdvisory[];
}

export interface ICheckpointAdvisory {
	readonly id: string;
	readonly severity: 'info' | 'warning' | 'blocker';
	readonly message: string;
	readonly nextAction?: string;
}
