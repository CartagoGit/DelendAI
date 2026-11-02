/**
 * Contract shapes for `./github-forge`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `github-forge.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `github-forge.ts`, so no import site changes.
 */

import type { IGhExec } from '../forge-governance/github-adapter';

/** Construction options, mirroring the governance adapter's. */
export interface IGithubIntegrationForgeOptions {
	readonly cwd?: string;
	/** Writes are refused unless this is explicitly true. */
	readonly mutationsEnabled?: boolean;
	readonly exec?: IGhExec;
	readonly timeoutMs?: number;
}
