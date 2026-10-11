/**
 * safe-rename.ts — rename-without-clobber primitive.
 *
 * POSIX `rename(2)` atomically REPLACES an existing destination —
 * silent overwrite is the default, not an error. The natural "move
 * a proposal" workflow tries `git mv` first (which refuses to clobber
 * and returns a non-ok result), then falls back to a plain `rename`
 * when git is unavailable, the worktree is dirty, or the path is
 * outside the repo. The fallback path was previously the bare
 * `rename(fromAbs, toAbs)` call, which on POSIX destroys whatever
 * happened to live at `toAbs` without any signal to the caller.
 *
 * `safeRename` keeps the simple primitive shape but refuses the
 * clobber with a typed `SafeRenameTargetExistsError`. Every
 * fallback-after-git-mv site in the codebase shares this guard so
 * the failure mode is uniform and grep-able.
 *
 * The companion `SafeRenameTargetExistsError` is exported alongside
 * so callers can branch on the specific failure (e.g. log a
 * `proposal-collision` diagnostic) without string-matching the
 * error message.
 *
 * The helper does NOT verify that `fromAbs` exists — `rename` will
 * surface `ENOENT` for the caller, which is the right shape (a
 * missing source is a real error, not an "ambiguous outcome" we
 * should paper over).
 */
import { access, rename } from 'node:fs/promises';

/**
 * Thrown by {@link safeRename} when `toAbs` already exists. The
 * source path is preserved so the caller can format a clear
 * diagnostic and pick the right recovery (collision rename,
 * quarantine, manual review).
 */
export class SafeRenameTargetExistsError extends Error {
	override readonly name = 'SafeRenameTargetExistsError';
	constructor(
		readonly fromAbs: string,
		readonly toAbs: string,
	) {
		super(
			`refusing to overwrite existing target via rename: ${toAbs} (from ${fromAbs})`,
		);
	}
}

/**
 * Rename `fromAbs` to `toAbs`, refusing to clobber an existing
 * destination. The check and the rename are not atomic — a concurrent
 * writer could race between them — so call sites that need
 * cross-process safety MUST wrap this in `withFileMutex` keyed on the
 * destination path (the source alone is insufficient: two agents
 * could each have their own source and race for the same target).
 *
 * The `access` probe is intentionally a `try/catch` rather than
 * `fs.constants.F_OK` so we don't pull `node:fs` into a `node:fs/promises`
 * call site just for one flag.
 */
export const safeRename = async (
	fromAbs: string,
	toAbs: string,
): Promise<void> => {
	const targetExists = await access(toAbs).then(
		() => true,
		() => false,
	);
	if (targetExists) {
		throw new SafeRenameTargetExistsError(fromAbs, toAbs);
	}
	await rename(fromAbs, toAbs);
};
