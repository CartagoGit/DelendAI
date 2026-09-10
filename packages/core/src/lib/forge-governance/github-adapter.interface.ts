/**
 * Contract shapes for `./github-adapter`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `github-adapter.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `github-adapter.ts`, so no import site changes.
 */

import type {
	IExternalTool,
	IExternalToolRun,
	IRunExternalToolInput,
} from '../contracts/interfaces/external-tool.interface';

/** Injected exec seam — defaults to the shared external-tool runner. */
export type IGhExec = (
	input: IRunExternalToolInput,
) => Promise<IExternalToolRun>;

/** Construction options for the GitHub adapter. */
export interface IGithubAdapterOptions {
	/** Working directory for the `gh` child process. */
	readonly cwd?: string;
	/**
	 * Writes are refused unless this is explicitly true. Reading is always
	 * allowed; mutating a real repository never happens by accident.
	 */
	readonly mutationsEnabled?: boolean;
	readonly exec?: IGhExec;
	/** Environment used ONLY to classify the credential seam, never read for a value. */
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly timeoutMs?: number;
}
