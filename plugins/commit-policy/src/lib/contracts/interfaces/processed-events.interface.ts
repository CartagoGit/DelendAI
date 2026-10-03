/**
 * processed-events.interface.ts — the shapes of the idempotency store
 * that keeps a commit event from being applied twice.
 */

export type ITerminalOutcome =
	| 'APPLIED'
	| 'NO_CHANGE'
	| 'PERMANENT_REFUSAL'
	| 'CAUSALITY_VIOLATION';

export interface IProcessedRecord {
	readonly key: string;
	/**
	 * `null` when the terminal outcome is not a commit (NO_CHANGE,
	 * PERMANENT_REFUSAL, CAUSALITY_VIOLATION). `APPLIED` writes the
	 * commit sha here. Older records (pre-f00417) keep `sha: <sha>`
	 * for backwards compatibility — readers should treat them as
	 * `APPLIED` with no `reason`.
	 */
	readonly sha: string | null;
	readonly ts: number;
	readonly outcome: ITerminalOutcome;
	readonly reason?: string;
}

export interface IProcessedEventsStore {
	has(key: string): Promise<boolean>;
	add(key: string, sha: string, now?: number): Promise<void>;
	/**
	 * f00417: record a terminal outcome for an event whose result
	 * is not a commit. The engine calls this for NO_CHANGE,
	 * CAUSALITY_VIOLATION and PERMANENT_REFUSAL. Terminal outcomes
	 * are never re-emitted by the slice listener.
	 */
	recordTerminal(
		key: string,
		outcome: Exclude<ITerminalOutcome, 'APPLIED'>,
		reason?: string,
		now?: number,
	): Promise<void>;
	prune(now: number): Promise<number>;
	dispose(): Promise<void>;
}

export interface IProcessedEventsOptions {
	readonly workspaceRoot: string;
	/** TTL in milliseconds. Default 30 days. */
	readonly ttlMs?: number;
	/** Path under workspaceRoot. Default `.commit-policy/processed-events.jsonl`. */
	readonly path?: string;
	/** Prune every N adds. Default 100. */
	readonly pruneEvery?: number;
}
