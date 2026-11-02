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
