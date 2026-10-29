/**
 * safe-list-dir.ts — no-silent-readdir primitive.
 *
 * x00509 / B19: many plugins (`proposals`, `i18n`, `usage-tracking`,
 * `security`, `forge`, `quality`, `diagram`, `docs`, ...) used to do
 * `readdir(...).catch(() => [])` so a transient filesystem failure
 * (EACCES, EIO, EMFILE) collapsed to the same shape as a truly empty
 * directory. The intent was "don't crash on a missing directory", but
 * the side effect was "every silent read failure looks like 0
 * findings" — exactly the opposite of what `logs.log` wants to
 * surface.
 *
 * `safeListDir` keeps the happy path (return `Dirent[]`) but
 * distinguishes three terminal shapes:
 *
 *   - **directory exists, empty**: `entries: []`, `readFailed: undefined`
 *   - **directory does not exist**: `entries: []`,
 *     `reason: 'directory-does-not-exist'` (a legitimate empty)
 *   - **transient read failure**: `entries: []`,
 *     `reason: 'read-failed'` + the original `error` preserved
 *
 * The caller decides what to do. Most callers will:
 *   1. iterate `entries` as before,
 *   2. emit a `ctx.logs.log({ severity: 'warning',
 *      incidentType: 'directory-read-failed', context: { absDir,
 *      error } })` when `readFailed === true`,
 *   3. return a structured result that includes the `reason` so
 *      diagnostic tools (and the agent's next orientation pass) can
 *      see the failure instead of getting a false "0 findings".
 */
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Dirent } from 'node:fs';

export type TSafeListDirEntry = Dirent;

export interface ISafeListDirResult {
	/** The directory entries. Empty when the dir does not exist OR a read failure happened. */
	readonly entries: readonly TSafeListDirEntry[];
	/** True iff the directory existed but the read failed (EACCES / EIO / EMFILE / ENOTDIR). */
	readonly readFailed: boolean;
	/** Stable diagnostic label, set whenever `entries` is empty. */
	readonly reason:
		| 'directory-does-not-exist'
		| 'directory-empty'
		| 'not-a-directory'
		| 'read-failed'
		| undefined;
	/** Original error (only set when `reason === 'read-failed'`). */
	readonly error: unknown;
}

/**
 * Read a directory without silently masking failures. See file header.
 *
 * Symlinks: `readdir` follows symlinks for the directory itself, but
 * returns Dirent entries whose `isSymbolicLink()` is true for symlink
 * children. Callers that need to resolve those should use
 * `realpathContained` from `@delendai/core/public` on each child.
 *
 * The `maxDepth` parameter is intentionally absent: directory walking
 * belongs in `walk-allowed-files.ts`, not here. This helper covers
 * the single-level case that 90% of plugins need.
 */
export const safeListDir = async (
	absDir: string,
): Promise<ISafeListDirResult> => {
	if (!isAbsolute(absDir)) {
		throw new Error(`safeListDir requires an absolute path; got ${absDir}`);
	}
	try {
		const entries = await readdir(absDir, { withFileTypes: true });
		if (entries.length === 0) {
			return {
				entries: [],
				readFailed: false,
				reason: 'directory-empty',
				error: undefined,
			};
		}
		return {
			entries,
			readFailed: false,
			reason: undefined,
			error: undefined,
		};
	} catch (error) {
		// ENOENT (the directory itself is missing) is a legitimate
		// "nothing to do" signal — many call sites are checking
		// "does this optional directory exist?" and that question
		// deserves a quiet "no". Anything else is a real failure
		// that the caller should surface.
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT') {
			return {
				entries: [],
				readFailed: false,
				reason: 'directory-does-not-exist',
				error: undefined,
			};
		}
		// ENOTDIR: the path exists but is not a directory (file,
		// socket, symlink to file). Surface as a separate reason so
		// callers can distinguish "missing" from "wrong type" in
		// diagnostics.
		if (code === 'ENOTDIR') {
			return {
				entries: [],
				readFailed: true,
				reason: 'not-a-directory',
				error,
			};
		}
		// EACCES / EIO / EMFILE / ENFILE / anything else: real
		// failure that must NOT collapse to "0 entries".
		return {
			entries: [],
			readFailed: true,
			reason: 'read-failed',
			error,
		};
	}
};

/**
 * Convenience: same as {@link safeListDir} but returns `string[]`
 * instead of `Dirent[]`. Useful for plugins that only need file
 * names (most plugin scans fall in this category).
 */
export const safeListDirNames = async (
	absDir: string,
): Promise<{ names: readonly string[]; result: ISafeListDirResult }> => {
	const result = await safeListDir(absDir);
	return {
		names: result.entries.map((entry) => entry.name),
		result,
	};
};

/**
 * Test-only helper — returns the canonical empty-result shape for
 * the given reason. Keeps the suite's mocks honest (a single source
 * of truth for the result object shape).
 */
export const emptySafeListDirResult = (
	reason: NonNullable<ISafeListDirResult['reason']>,
	error?: unknown,
): ISafeListDirResult => {
	const readFailed = reason === 'read-failed' || reason === 'not-a-directory';
	return {
		entries: [],
		readFailed,
		reason,
		error: error ?? undefined,
	};
};

/**
 * Thrown by {@link safeListDirRequired} when the directory exists but
 * the read failed (EACCES / EIO / EMFILE / ENOTDIR). ENOENT is
 * silently treated as "the optional directory does not exist" and
 * returns an empty array; only real read failures raise.
 *
 * The `absDir` and `cause` fields are preserved so callers can
 * surface the original diagnostic without re-parsing the message.
 *
 * x00517 / B19 follow-up: every consumer that builds durable state
 * (the proposals reconciliador, the SQLite shadow harness) MUST use
 * this fail-closed primitive instead of `safeListDir(...).entries`
 * so a partial read failure is observable rather than invisible.
 */
export class SafeListDirReadFailed extends Error {
	override readonly name = 'SafeListDirReadFailed';
	constructor(
		readonly absDir: string,
		override readonly cause: unknown,
		readonly reason: 'not-a-directory' | 'read-failed',
	) {
		super(
			`safeListDirRequired: failed to read ${absDir} (${reason}): ${
				(cause as NodeJS.ErrnoException | undefined)?.message ??
				String(cause)
			}`,
		);
	}
}

/**
 * Fail-closed variant of {@link safeListDir}. Returns the entries
 * when the directory exists and is readable (including empty
 * directories); throws `SafeListDirReadFailed` when the read fails
 * for any reason other than ENOENT.
 *
 * Use this primitive instead of `safeListDir` when the result feeds
 * durable state — a partial read failure must abort the publication
 * pipeline rather than publish a generation built on an unverified
 * subtree.
 *
 * @example
 *   let entries: Dirent[];
 *   try {
 *     entries = await safeListDirRequired(absDir);
 *   } catch (e) {
 *     if (e instanceof SafeListDirReadFailed) {
 *       ctx.logs.log({ severity: 'warning',
 *         incidentType: 'directory-read-failed',
 *         context: { absDir: e.absDir, code: e.cause?.code } });
 *     }
 *     throw e;
 *   }
 */
export const safeListDirRequired = async (
	absDir: string,
): Promise<readonly TSafeListDirEntry[]> => {
	const result = await safeListDir(absDir);
	if (result.readFailed) {
		throw new SafeListDirReadFailed(
			absDir,
			result.error,
			result.reason as 'not-a-directory' | 'read-failed',
		);
	}
	return result.entries;
};

/**
 * Path check helper that combines {@link stat} with safe error
 * discrimination. Mirrors {@link safeListDir}'s reasoning so a
 * "this optional cache dir exists?" probe can use one helper for
 * both directories and individual files.
 */
export const safePathExists = async (
	absPath: string,
): Promise<
	| { exists: true; kind: 'file' | 'directory' | 'other' }
	| {
			exists: false;
			reason: 'path-does-not-exist' | 'stat-failed';
			error?: unknown;
	  }
> => {
	if (!isAbsolute(absPath)) {
		throw new Error(
			`safePathExists requires an absolute path; got ${absPath}`,
		);
	}
	try {
		const s = await stat(absPath);
		const kind = s.isDirectory()
			? 'directory'
			: s.isFile()
				? 'file'
				: 'other';
		return { exists: true, kind };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return { exists: false, reason: 'path-does-not-exist' };
		}
		return { exists: false, reason: 'stat-failed', error };
	}
};
