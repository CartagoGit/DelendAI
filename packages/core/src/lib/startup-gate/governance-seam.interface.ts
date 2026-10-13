/**
 * Contract shapes for `./governance-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `governance-seam.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `governance-seam.ts`, so no import site changes.
 */

export interface IGovernanceSeamOptions {
	/** Environment consulted for credential AVAILABILITY only. */
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly cwd?: string | undefined;
}
