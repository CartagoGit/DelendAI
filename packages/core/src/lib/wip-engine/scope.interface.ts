/**
 * Contract shapes for `./scope`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `scope.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `scope.ts`, so no import site changes.
 */

/** A claimed path that git could never accept, and why. */
export interface IInvalidScopePath {
	readonly path: string;
	readonly reason: string;
}

/** Result of validating a claim before any git command runs. */
export interface IScopeValidation {
	readonly valid: readonly string[];
	readonly invalid: readonly IInvalidScopePath[];
}
