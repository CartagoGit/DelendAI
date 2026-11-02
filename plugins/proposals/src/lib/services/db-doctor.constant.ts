/**
 * Constants for `./db-doctor`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `db-doctor.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `db-doctor.ts`, so no import site changes.
 */

/**
 * The one check a doctor can always answer: is there a database to
 * examine at all?
 *
 * The proposals database is a MATERIALIZED VIEW — derived, rebuildable,
 * never synced between machines and deliberately gitignored. So its
 * absence is the normal state of a fresh clone or a CI runner, not
 * corruption. Opening it `readonly` in that state throws `unable to open
 * database file`, which turned the diagnostic tool into the thing that
 * needed diagnosing.
 *
 * The verdict is therefore tri-state, exactly like the governance gates:
 * the tool RAN (so it does not crash and callers still get a well-formed
 * result), it did not pass (so `healthy` stays false and nobody can read
 * a green light into an empty result), and the message names the remedy
 * instead of the errno.
 *
 * The condition is detected by LETTING THE OPEN FAIL and classifying the
 * error, rather than probing the filesystem first. Two reasons: an
 * existence probe followed by an open is a race (the file can appear or
 * vanish in between, and the doctor would then throw the very exception
 * this exists to prevent), and `SQLITE_CANTOPEN` is a structured code —
 * far more reliable than matching the words "unable to open".
 */
export const DATABASE_PRESENT_CHECK = 'database-present';
