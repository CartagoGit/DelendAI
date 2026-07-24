/**
 * env.interface.ts — types for the env plugin's `.env` validation. Kept under
 * contracts/interfaces per the types-in-contracts convention.
 */

/** One parsed `.env` assignment. */
export interface IEnvEntry {
	readonly key: string;
	/** 1-indexed source line. */
	readonly line: number;
	/** True when the value is empty (`KEY=`). */
	readonly empty: boolean;
}

/** The result of parsing a `.env` file. */
export interface IParsedEnv {
	readonly entries: readonly IEnvEntry[];
	/** 1-indexed lines that are non-blank, non-comment, and have no `=`. */
	readonly malformedLines: readonly number[];
}

/** Injected I/O seam so the check is unit-testable without a filesystem. */
export interface IEnvScanDeps {
	/** Read the `.env` text, or undefined when it does not exist. */
	readonly readEnv: (path: string) => Promise<string | undefined>;
}

/** Options for the `env_check` tool builder. */
export interface IEnvCheckToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable reader for tests; production reads the filesystem. */
	readonly deps?: IEnvScanDeps;
}
