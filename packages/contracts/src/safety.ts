/**
 * safety.ts — types describing consent / dry-run / containment
 * gates that protect the host runtime from accidental damage.
 *
 * r00029 (Track C / §10): pure types only.
 */

import type { IsoTimestamp } from './primitives';

/** Reason a tool was blocked. */
export type SafetyBlockReason =
	| 'consent-required'
	| 'dry-run-violation'
	| 'path-escape'
	| 'rate-limit'
	| 'capability-denied';

/** Payload returned when a tool is blocked by a safety gate. */
export interface ISafetyBlock {
	readonly reason: SafetyBlockReason;
	readonly detail: string;
	readonly observedAt: IsoTimestamp;
}

/** Result of a path-containment probe (path is inside/outside the workspace). */
export interface IContainmentProbe {
	readonly allowed: boolean;
	readonly observedPath: string;
	readonly workspaceRoot: string;
	readonly reason?: string;
}
