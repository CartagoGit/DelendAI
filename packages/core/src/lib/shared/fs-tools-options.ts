/**
 * fs-tools-options.ts — the shared option + result shapes for the
 * workspace filesystem primitives (`fs_read` / `fs_write`).
 *
 * Extracted from the original `fs-tools.ts` so each tool file
 * (`fs-read.ts`, `fs-write.ts`) can import the shapes without
 * pulling in the implementation of the other. SRP — every
 * interface below describes one tool's input or output, no
 * helper functions live here.
 *
 * ISP — `IFsWriteOptions` only has the two flags a writer cares
 * about; `IFsReadResult` only has the four fields a reader
 * returns. Callers that only read don't have to import the write
 * options.
 */

export interface IFsReadResult {
	readonly path: string;
	readonly found: boolean;
	readonly content: string | null;
	readonly totalLines: number | null;
	readonly range: readonly [number, number] | null;
}

export interface IFsWriteResult {
	readonly path: string;
	readonly ok: boolean;
	readonly bytesWritten: number;
	readonly error?: string;
}

export interface IFsWriteOptions {
	/** Create parent directories if missing. Default false. */
	readonly createDirs?: boolean;
	/**
	 * Use `writeFileAtomic` guarded by `withFileMutex` (crash-safe,
	 * concurrency-safe). Default true — set false only when the caller
	 * already holds an equivalent guarantee and wants a plain write.
	 */
	readonly atomic?: boolean;
}

export interface IFsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/**
	 * f00089 U5 — additional absolute roots an operator has explicitly
	 * authorized for `fs_read` / `fs_write`, sourced from the committed
	 * `mcp-vertex.config.json` (`filesystem.authorizedRoots`). A path
	 * (relative or absolute) is allowed when it falls inside the workspace
	 * root OR inside one of these roots. Off by default (`[]` / omitted):
	 * with no authorized roots the tools behave byte-identically to the
	 * single-root, reject-absolute behaviour that predates the allowlist.
	 */
	readonly authorizedRoots?: readonly string[];
}
