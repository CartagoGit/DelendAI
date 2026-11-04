/**
 * git-read.interface.ts — how a synchronous git read may be asked for.
 */
export interface IGitReadOptions {
	/** Bytes of output allowed before the read fails; 64 MiB by default. */
	readonly maxBuffer?: number | undefined;
	/**
	 * Keep the output as git wrote it. Porcelain status is column-aligned:
	 * trimming it eats the leading space of a ` M path` entry.
	 */
	readonly verbatim?: boolean | undefined;
	/** Written to git's standard input (`hash-object --stdin`, …). */
	readonly input?: string | undefined;
}

/** One git process about to run: where, and with which arguments. */
export interface IGitSpawn {
	readonly cwd: string;
	readonly args: readonly string[];
}

/** Told of every git process the seam starts, before it starts. */
export type GitSpawnObserver = (spawn: IGitSpawn) => void;

/**
 * What one command invocation may remember of its git reads. The seam
 * asks before a read spawns and tells after; every git command that runs,
 * read or write, is reported to `ran` so the cache can forget what that
 * command may have changed.
 */
export interface IGitReadCache {
	/** The remembered raw output (`undefined` = git failed), or no entry. */
	recall(
		spawn: IGitSpawn,
	): { readonly output: string | undefined } | undefined;
	remember(spawn: IGitSpawn, output: string | undefined): void;
	ran(spawn: IGitSpawn): void;
}
