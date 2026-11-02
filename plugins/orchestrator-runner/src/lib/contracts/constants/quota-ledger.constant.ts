/**
 * quota-ledger.constant.ts — where the quota reservation ledger lives.
 *
 * Quota belongs to an account, and an account is used from every
 * workspace on the machine: one ledger per workspace let two of them
 * reserve the same room. The ledger is the machine's, in the user cache.
 */

/** The ledger's file, in the machine's delendai cache. */
export const QUOTA_LEDGER_FILE = 'orchestrator-runner/quota-reservations.json';

/** Overrides where the machine's ledger is kept. */
export const QUOTA_LEDGER_VARIABLE = 'DELENDAI_QUOTA_LEDGER';

/** The file each workspace used to keep its own ledger in, under the plugin cache. */
export const WORKSPACE_LEDGER_FILE = 'quota-reservations.json';
