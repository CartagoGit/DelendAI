/**
 * Constants for `./credential-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `credential-seam.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `credential-seam.ts`, so no import site changes.
 */

/** Where the child process will get its authentication from. */
export const FORGE_CREDENTIAL_SOURCES = [
	/** `GH_TOKEN` is exported in the ambient environment. */
	'gh-token-env',
	/** `GITHUB_TOKEN` is exported (CI's default injection). */
	'github-token-env',
	/** Neither is set; `gh` will use its own stored login, if any. */
	'gh-cli-login',
] as const;
