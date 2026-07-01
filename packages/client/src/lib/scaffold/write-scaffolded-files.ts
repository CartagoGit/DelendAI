/**
 * write-scaffolded-files.ts — f00087 S2.
 *
 * Apply a list of `IScaffoldedFile` (typically produced by
 * `scaffoldPluginFiles` or one of the other generators in
 * `@mcp-vertex/core/public#scaffold-*`) to a target directory on disk,
 * using the same atomic batch writer the MCP scaffold tool uses
 * internally. Refuses to overwrite existing files unless
 * `keepLegacy: true` is passed (in which case the existing file moves
 * to `<targetDir>/legacy/<base>-<ts>[-<n>]<ext>` before the new
 * bytes land).
 *
 * Pure orchestration: this file does NOT know how to plan or commit a
 * batch; the injected `IBatchAtomicWriter` owns that. Tests inject a
 * fake writer; production passes `createFileSystemBatchWriter(targetDir)`
 * from `@mcp-vertex/core/public`.
 */
import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import type {
	IBatchAtomicWriter,
	IBatchOperation,
} from '@mcp-vertex/core/public';
import { createFileSystemBatchWriter } from '@mcp-vertex/core/public';

import type { IScaffoldedFile } from '@mcp-vertex/core/public';

/** Outcome of one `writeScaffoldedFiles` call. */
export interface IWriteScaffoldedFilesResult {
	/** Workspace-relative paths of newly written files (in submission order). */
	readonly written: readonly string[];
	/** Paths that already existed on disk and were left untouched. */
	readonly skipped: readonly string[];
	/** Paths moved under `legacy/<base>-<ts>[-<n>]<ext>` to make room. */
	readonly moved: readonly string[];
	/** Paths that already existed AND were kept in place (alias of `skipped` for callers that prefer that wording). */
	readonly kept: readonly string[];
	/** Per-path failure messages. Empty when every file was either written or skipped. */
	readonly errors: readonly string[];
}

/** Options accepted by `writeScaffoldedFiles`. */
export interface IWriteScaffoldedFilesOptions {
	/**
	 * Default `false`. When `true`, an existing file at the same path
	 * is moved to `<targetDir>/legacy/<base>-<ts>[-<n>]<ext>` before
	 * the new content is written. Mirrors the MCP scaffold tool's
	 * `keepLegacy` semantics so a script invocation behaves identically
	 * to a host-driven `<prefix>_scaffold` call.
	 */
	readonly keepLegacy?: boolean;
	/** Injectable batch writer. Defaults to `createFileSystemBatchWriter(targetDir)`. */
	readonly batchWriter?: IBatchAtomicWriter;
}

const pathExists = async (absolutePath: string): Promise<boolean> => {
	try {
		await stat(absolutePath);
		return true;
	} catch {
		return false;
	}
};

const allocateLegacyPath = async (
	targetDir: string,
	relativePath: string,
): Promise<string> => {
	const ext = extname(relativePath);
	const base = basename(relativePath, ext);
	const ts = Date.now().toString(36);
	for (let index = 0; index < 1000; index += 1) {
		const suffix = index === 0 ? '' : `-${index.toString(36)}`;
		const candidate = join(
			targetDir,
			`legacy/${base}-${ts}${suffix}${ext}`,
		);
		if (!(await pathExists(candidate))) return candidate;
	}
	throw new Error(`could not allocate legacy path for ${relativePath}`);
};

const moveExistingToLegacy = async (
	sourceAbsolute: string,
	legacyAbsolute: string,
): Promise<void> => {
	try {
		await rename(sourceAbsolute, legacyAbsolute);
		return;
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? (error as { code?: unknown }).code
				: undefined;
		if (code !== 'EXDEV') throw error;
		// Cross-device rename: copy then unlink (atomic enough for a
		// single-file move; if the copy fails the original stays put
		// and the caller sees the error).
		await copyFile(sourceAbsolute, legacyAbsolute);
		await unlink(sourceAbsolute);
	}
};

/**
 * Plan the writes for a target directory: detect collisions, allocate
 * legacy paths when `keepLegacy` is set, and emit the operations the
 * batch writer will commit. Pure data wrangling — the only side
 * effect is the `mkdir -p` for each legacy destination.
 */
const planWrites = async (
	targetDir: string,
	files: readonly IScaffoldedFile[],
	options: { readonly keepLegacy?: boolean },
): Promise<{
	readonly operations: readonly IBatchOperation[];
	readonly skipped: readonly string[];
	readonly moved: readonly string[];
	readonly kept: readonly string[];
	readonly errors: readonly string[];
}> => {
	const keepLegacy = options.keepLegacy ?? false;
	const operations: IBatchOperation[] = [];
	const skipped: string[] = [];
	const moved: string[] = [];
	const kept: string[] = [];
	const errors: string[] = [];

	for (const file of files) {
		const absolute = join(targetDir, file.path);
		const exists = await pathExists(absolute);
		if (exists && !keepLegacy) {
			skipped.push(file.path);
			kept.push(file.path);
			continue;
		}
		if (exists && keepLegacy) {
			try {
				const legacy = await allocateLegacyPath(targetDir, file.path);
				await mkdir(dirname(legacy), { recursive: true });
				await moveExistingToLegacy(absolute, legacy);
				moved.push(file.path);
			} catch (error) {
				errors.push(
					`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
				continue;
			}
		}
		operations.push({ path: file.path, content: file.content });
	}

	return { operations, skipped, moved, kept, errors };
};

/**
 * Write a list of scaffolded files under `targetDir`. The default
 * batch writer is the filesystem-backed one used by the MCP scaffold
 * tool; callers (mostly tests) can inject a fake.
 *
 * The function never throws on per-file failures — they accumulate in
 * `result.errors` so a single typo doesn't abort the rest of the
 * scaffold. The whole batch is rolled back by the underlying writer
 * if any `writeAll` operation fails.
 */
export const writeScaffoldedFiles = async (
	targetDir: string,
	files: readonly IScaffoldedFile[],
	options: IWriteScaffoldedFilesOptions = {},
): Promise<IWriteScaffoldedFilesResult> => {
	const batchWriter: IBatchAtomicWriter =
		options.batchWriter ?? createFileSystemBatchWriter(targetDir);
	const plan = await planWrites(targetDir, files, options);
	const written: string[] = [];
	const errors: string[] = [...plan.errors];
	if (plan.operations.length > 0) {
		const batchResult = await batchWriter.writeAll(plan.operations);
		if (batchResult.ok) {
			written.push(...batchResult.committed);
		} else {
			for (const err of batchResult.errors) {
				errors.push(`${err.path}: ${err.reason}`);
			}
		}
	}
	return {
		written,
		skipped: plan.skipped,
		moved: plan.moved,
		kept: plan.kept,
		errors,
	};
};

/**
 * Default-on-disk convenience: same as `writeScaffoldedFiles` but
 * returns `void` and re-throws on the first error. Useful for
 * `bun run tools/scripts/create-plugin.ts <name>` style scripts that
 * prefer a non-zero exit on failure.
 */
export const writeScaffoldedFilesOrThrow = async (
	targetDir: string,
	files: readonly IScaffoldedFile[],
	options: IWriteScaffoldedFilesOptions = {},
): Promise<IWriteScaffoldedFilesResult> => {
	const result = await writeScaffoldedFiles(targetDir, files, options);
	if (result.errors.length > 0) {
		throw new Error(
			`writeScaffoldedFiles failed for ${result.errors.length} file(s):\n${result.errors.join('\n')}`,
		);
	}
	return result;
};
