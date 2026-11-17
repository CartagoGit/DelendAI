/**
 * The shape every reader of the agent lock file needs in order to
 * decide whether a claim is still held, and the policy it decides
 * against. See `lock-entry-expiry.ts`: the rule lives in core because
 * it belongs to no single plugin, and because two readers answering it
 * differently produced a lock that was free and held at once.
 */
export interface ILockExpiryEntry {
	readonly last_seen?: string | undefined;
	readonly host?: string | undefined;
	readonly pid?: number | undefined;
}

export interface ILockExpiryPolicy {
	readonly staleAfterMinutes: number;
	readonly nowMs?: number;
	/** This host's id and a liveness probe; omit to skip the orphan check. */
	readonly host?: string | undefined;
	readonly isProcessAlive?: ((pid: number) => boolean) | undefined;
}
