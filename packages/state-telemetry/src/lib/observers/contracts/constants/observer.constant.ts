/** Heartbeats a lease may miss before it is reported as missed. */
export const LEASE_MISSED_HEARTBEATS = 3;

/** Heartbeat cadence assumed when the caller does not pass one. */
export const LEASE_HEARTBEAT_INTERVAL_MS = 30_000;

/** Placeholder that replaces volatile fragments of a failure message. */
export const FAILURE_VOLATILE_PLACEHOLDER = '<n>';

/** Keys whose values never reach a hash: matched as a case-insensitive substring. */
export const SECRET_KEY_PATTERN =
	/token|secret|password|authorization|key|credential/i;
