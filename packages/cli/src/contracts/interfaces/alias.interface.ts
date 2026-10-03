/**
 * alias.interface.ts — b00239 S1.
 *
 * Shapes for the CLI's short-alias provisioning. The behaviour lives in
 * `lib/alias/alias-manager.ts`; only the vocabulary is here.
 */

/** What currently occupies the alias name. */
export type IAliasState = 'absent' | 'ours' | 'foreign' | 'unreadable';

/** What a provisioning attempt did about it. */
export type IAliasAction = 'created' | 'unchanged' | 'refused' | 'failed';

export interface IAliasStatus {
	readonly alias: string;
	readonly canonical: string;
	readonly state: IAliasState;
	/** Where the alias lives, or would live. */
	readonly path: string | undefined;
	/** Present when `state` is `foreign`: what occupies the name. */
	readonly occupiedBy?: string | undefined;
}

export interface IAliasOutcome {
	readonly action: IAliasAction;
	readonly status: IAliasStatus;
	/** Human-readable, non-fatal explanation. Always set for refused/failed. */
	readonly detail?: string | undefined;
}

export interface IAliasEnvironment {
	/** Platform, so Windows gets shims rather than a POSIX symlink. */
	readonly platform: 'win32' | 'posix';
	/** Directory the package manager puts executables in. */
	readonly binDir: string;
	/** Absolute path of the canonical executable the alias must reach. */
	readonly canonicalPath: string;
}

export interface IAliasIo {
	/** Contents of `path`, or `undefined` when it does not exist. */
	readonly read: (path: string) => Promise<string | undefined>;
	readonly write: (path: string, contents: string) => Promise<void>;
	readonly remove: (path: string) => Promise<void>;
	/** True when something occupies `path`, whatever it is. */
	readonly exists: (path: string) => Promise<boolean>;
	/** Join path segments for the target platform. */
	readonly join: (...parts: readonly string[]) => string;
	readonly makeExecutable?: (path: string) => Promise<void>;
}
