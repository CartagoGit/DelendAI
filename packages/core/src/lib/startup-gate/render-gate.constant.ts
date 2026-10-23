/**
 * Constants for `./render-gate`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `render-gate.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `render-gate.ts`, so no import site changes.
 */

/** Warning code every reconciliation message carries. */
export const STARTUP_RECONCILIATION_CODE = 'startup-reconciliation';
