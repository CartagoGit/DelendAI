/**
 * Constants for `./redact-secrets`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `redact-secrets.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `redact-secrets.ts`, so no import site changes.
 */

/** The stand-in written wherever a secret-shaped run of characters was. */
export const REDACTED = '***';
