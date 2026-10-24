/**
 * How long a published wait stays believable.
 *
 * Five minutes: 2.5× the 120s ceiling `await_lock` enforces on a single
 * wait, so a live waiter is never pruned out from under the deadlock
 * check, and short enough that a row orphaned by a hard kill cannot
 * outlive the claim it referred to and invent a deadlock that is over.
 */
export const WAIT_ENTRY_TTL_MS = 300_000;
