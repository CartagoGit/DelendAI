/**
 * contain-realpath.ts — symlink-aware containment (a00068).
 *
 * The lexical `contain-path.ts` rejects `../` and absolute escapes but,
 * by design, touches no filesystem and so does NOT follow symlinks. A
 * symlink INSIDE the workspace that points outside it (a malicious or
 * mistaken link committed to a repo) would let a read leak, or a write
 * escape, past the lexical check. This module is the async, fs-touching
 * companion that closes that gap; it is kept separate so `contain-path.ts`
 * stays pure and unit-testable without a disk.
 *
 * Defense-in-depth, NOT a TOCTOU-proof guarantee: a symlink swapped in
 * between this check and the actual read/write is a residual window the
 * host filesystem sandbox must still own. It closes the common
 * "pre-existing symlink in the tree" vector cheaply.
 */
import { realpath } from 'node:fs/promises';
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from 'node:path';

/**
 * Resolve the real (symlink-followed) path of `abs`, tolerating a
 * not-yet-existing tail: `realpath` the deepest existing prefix and
 * re-append the missing components. So a target whose PARENT is a symlink
 * out of the workspace resolves to its true on-disk location, and an
 * existing target that IS a symlink resolves to what it points at.
 */
export const realResolvePath = async (abs: string): Promise<string> => {
	try {
		return await realpath(abs);
	} catch {
		const parent = dirname(abs);
		if (parent === abs) return abs;
		return join(await realResolvePath(parent), basename(abs));
	}
};

/**
 * True when `absTarget`'s REAL (symlink-resolved) location stays inside
 * the real path of one of `roots` (the workspace root plus any authorized
 * roots). Both sides are `realpath`-resolved, so a workspace legitimately
 * reached through a symlink (a repo under a symlinked path, macOS `/tmp` →
 * `/private/tmp`) is not a false positive.
 */
export const realpathContained = async (
	absTarget: string,
	roots: readonly string[],
): Promise<boolean> => {
	const realTarget = await realResolvePath(absTarget);
	for (const root of roots) {
		let realRoot: string;
		try {
			realRoot = await realpath(root);
		} catch {
			realRoot = resolve(root);
		}
		const rel = relative(realRoot, realTarget);
		if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
			return true;
		}
	}
	return false;
};
