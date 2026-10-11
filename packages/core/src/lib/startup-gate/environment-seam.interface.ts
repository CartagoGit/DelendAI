/**
 * Contract shapes for `./environment-seam`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `environment-seam.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `environment-seam.ts`, so no import site changes.
 */

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';

/** Host facts the machine id is derived from. Injectable for specs. */
export interface IStartupHostFacts {
	readonly hostname: string;
	readonly platform: string;
	readonly arch: string;
}

export interface IStartupEnvironmentSeamOptions {
	readonly workspaceRoot: string;
	readonly git: IGitRunner;
	/**
	 * The identity this process reconciles as. Injected because core is
	 * agnostic about who the agent is; the host resolves it.
	 */
	readonly agentId: string;
	/** Overridable so a spec can produce a deterministic environment. */
	readonly hostFacts?: IStartupHostFacts | undefined;
}
