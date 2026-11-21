/**
 * The one place that says which forge answers a read survives: a GET that
 * fails with one of these statuses, or with a dropped connection, is read
 * again after each delay. Writes and 4xx answers are never retried.
 */
export const FORGE_READ_RETRY = {
	statuses: [502, 503, 504],
	/** Waits before each further attempt: three retries, four attempts in all. */
	delaysMs: [1000, 3000, 9000],
} as const;
