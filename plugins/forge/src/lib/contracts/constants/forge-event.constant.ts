/** Constants for the forge event port. */

/**
 * Every normalised event a forge adapter may emit. A subscriber reads one
 * of these names and never a forge's own event name, so a second forge
 * changes nothing downstream.
 */
export const FORGE_EVENT_KINDS = [
	'pr.opened',
	'pr.updated',
	'pr.ready',
	'pr.merged',
	'pr.closed',
	'check.completed',
	'review.submitted',
	'issue.opened',
	'issue.updated',
	'issue.closed',
	'branch.pushed',
	'pr.commented',
] as const;

/** What changed on a pull request reported as `pr.updated`. */
export const FORGE_PR_CHANGES = [
	'labelled',
	'unlabelled',
	'synchronized',
	'edited',
	'drafted',
	'reopened',
] as const;

/**
 * Why a delivery produced no event. Counted, never thrown: a forge that
 * sends something new must not take the receiver down.
 */
export const FORGE_EVENT_DROP_REASONS = {
	/** The body is not JSON. */
	malformedPayload: 'malformed-payload',
	/** The delivery names no event the adapter can read. */
	unnamedDelivery: 'unnamed-delivery',
	/** The adapter threw while mapping; its bug, counted rather than raised. */
	adapterFailed: 'adapter-failed',
	/** The adapter returned a kind this port does not declare. */
	undeclaredKind: 'undeclared-kind',
	/** The signature did not verify with this connection's secret. */
	signatureRefused: 'signature-refused',
} as const;

/**
 * How a receiver retries a connection. A retry is one delayed attempt after
 * a failure, doubling up to five minutes; eight failures in a row and it
 * stops and says so, leaving its owner on whatever fallback it keeps. A
 * connection that stayed up a minute was healthy, and resets the count.
 */
export const FORGE_EVENT_RETRY_DEFAULTS = {
	firstDelayMs: 1_000,
	maxDelayMs: 300_000,
	maxAttempts: 8,
	stableMs: 60_000,
} as const;

/** Bytes of randomness in a per-connection signing secret. */
export const FORGE_EVENT_SECRET_BYTES = 32;
