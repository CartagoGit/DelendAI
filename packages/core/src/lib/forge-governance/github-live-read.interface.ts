/**
 * Contract shapes for `./github-live-read`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `github-live-read.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `github-live-read.ts`, so no import site changes.
 */

/**
 * How a failed protection read should be interpreted. `unprotected` is a
 * positive factual claim; `unreadable` is the absence of one.
 */
export type IProtectionFailure =
	| { readonly kind: 'unprotected' }
	| { readonly kind: 'unreadable'; readonly reason: string };
