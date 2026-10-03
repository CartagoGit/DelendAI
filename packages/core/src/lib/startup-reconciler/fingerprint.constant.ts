/**
 * Constants for `./fingerprint`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `fingerprint.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `fingerprint.ts`, so no import site changes.
 */

/** The event kind a boot's fingerprint is stored under. */
export const FINGERPRINT_EVENT_KIND = 'reconciliation-outcome' as const;

/** Marker inside the payload so other outcome events are not mistaken for one. */
export const FINGERPRINT_MARKER = 'startup-reconciler/fingerprint';
