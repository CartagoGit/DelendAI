/**
 * agent-detection.interface.ts — an agent found on this machine, and where.
 */

/** Where an agent was found. */
export type IAgentFoundIn =
	/** A registry agent's own executable is on PATH. */
	| 'path'
	/** A registry agent's package is installed globally (npm, pnpm, bun, pipx, uv). */
	| 'package'
	/** An IDE extension or IDE plugin. */
	| 'ide'
	/** An executable no catalogue names whose help speaks ACP or names a model or provider. */
	| 'path-candidate';

export interface IDetectedAgent {
	/** The registry id when the registry lists it. */
	readonly registryId?: string | undefined;
	readonly name: string;
	readonly foundIn: IAgentFoundIn;
	/** What was seen, in a line a person can check. */
	readonly evidence: string;
}

/** The machine as detection sees it; injected so specs build their own. */
export interface IDetectionMachine {
	/** Executable names on PATH. */
	readonly executables: () => Promise<readonly string[]>;
	/** Globally installed package names, from every package manager present. */
	readonly globalPackages: () => Promise<readonly string[]>;
	/** IDE extensions and plugins: their folder name and their manifest text, when there is one. */
	readonly ideExtensions: () => Promise<
		readonly {
			readonly ide: string;
			readonly id: string;
			readonly manifest?: string | undefined;
		}[]
	>;
	/** An executable's `--help`, with a short deadline; empty when it fails. */
	readonly help: (executable: string) => Promise<string>;
}
