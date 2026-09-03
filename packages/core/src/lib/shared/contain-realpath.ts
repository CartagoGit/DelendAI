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

import { resolveAgainstRoots, type IContainedPath } from './contain-path';

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

/**
 * PHYSICAL containment primitive (q00016 S4) for a path that DOES exist —
 * the shape a read entry point needs. Lexical containment alone
 * (`resolveWorkspaceContainedLexical` in `contain-path.ts`) never touches
 * the filesystem, so it cannot see that `workspace/foo` is a symlink to
 * `/home/user/.ssh`: the lexical check on `foo/config` passes because the
 * STRING never leaves the workspace, even though the FILE does. This
 * function closes that gap by comparing `realpath` of the workspace root
 * (and every authorized root) against `realpath` of the resolved target,
 * so a pre-existing symlink pointing outside is rejected before the caller
 * opens the file.
 *
 * Composes the lexical check (`resolveAgainstRoots`, so `authorizedRoots`
 * is honoured the same way it is on the write path) with
 * {@link realpathContained}. The rejection reason always names the
 * original path so a refusal is diagnosable rather than mysterious.
 *
 * Not for paths that don't exist yet — `realpath` throws on a missing
 * target's own final component the way `fs.readFile` would. Writers use
 * the lexical primitive instead; see its docstring for why one function
 * cannot serve both cases.
 */
export const resolveExistingWorkspaceContained = async (
	workspaceRootAbs: string,
	child: string,
	authorizedRoots: readonly string[] = [],
): Promise<IContainedPath> => {
	const lexical = resolveAgainstRoots(
		workspaceRootAbs,
		authorizedRoots,
		child,
	);
	if (!lexical.ok) {
		return lexical;
	}
	const containedPhysically = await realpathContained(lexical.abs, [
		workspaceRootAbs,
		...authorizedRoots,
	]);
	if (!containedPhysically) {
		return {
			ok: false,
			abs: lexical.abs,
			rel: lexical.rel,
			reason: `path escapes workspace via symlink: ${child}`,
		};
	}
	return lexical;
};
