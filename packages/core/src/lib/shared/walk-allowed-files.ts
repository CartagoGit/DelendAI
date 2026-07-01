import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Shared recursive-walk shape used by both `search` and `docs`: sorted
 * `readdir`, a truncation guard checked before each step, and the
 * domain-specific "skip this directory?" / "visit this file" decisions left
 * to the caller as injected callbacks. Gitignore matching, extension
 * allow-lists and any other filtering policy stay in the callers — this
 * helper only owns the generic traversal.
 */
export interface IWalkAllowedFilesOptions {
	/** Absolute workspace root, used to compute the relative dir path passed to `shouldSkipDir`. */
	readonly workspaceRootAbs: string;
	/** Absolute directory to start walking from. */
	readonly rootAbs: string;
	/** Checked before each directory/file step; once true, the walk stops early. */
	readonly isTruncated: () => boolean;
	/**
	 * Decide whether a subdirectory should be skipped entirely (not
	 * recursed into). `relDirPath` is workspace-relative with `/` separators.
	 */
	readonly shouldSkipDir: (relDirPath: string, dirName: string) => boolean;
	/** Called once per regular file found, in sorted order. */
	readonly visitFile: (absPath: string) => Promise<void> | void;
}

const relPosix = (rootAbs: string, abs: string): string =>
	relative(rootAbs, abs).split(sep).join('/');

/**
 * Recursively walk `rootAbs`, visiting files in deterministic
 * (name-sorted) order. Stops as soon as `isTruncated()` reports true —
 * checked before each directory recursion and before each file visit, so a
 * caller can cap result counts without the helper knowing about caps.
 */
export const walkAllowedFiles = async (
	options: IWalkAllowedFilesOptions,
): Promise<void> => {
	const { workspaceRootAbs, rootAbs, isTruncated, shouldSkipDir, visitFile } =
		options;

	const walk = async (absDir: string): Promise<void> => {
		if (isTruncated()) return;
		const entries = await readdir(absDir, { withFileTypes: true }).catch(
			() => null,
		);
		if (entries === null) return;
		const sorted = [...entries].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		for (const entry of sorted) {
			if (isTruncated()) return;
			const absPath = join(absDir, entry.name);
			if (entry.isDirectory()) {
				const relDir = relPosix(workspaceRootAbs, absPath);
				if (shouldSkipDir(relDir, entry.name)) continue;
				await walk(absPath);
			} else if (entry.isFile()) {
				await visitFile(absPath);
			}
		}
	};

	await walk(rootAbs);
};
