/**
 * Contract shapes for `./critical-section`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `critical-section.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `critical-section.ts`, so no import site changes.
 */

/** A named mutual-exclusion region. */
export interface ICriticalSection {
	run<T>(key: string, body: () => Promise<T>): Promise<T>;
}
