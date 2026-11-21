/**
 * contain-realpath-boot.ts — symlink-aware containment for boot time.
 *
 * A plugin's `register(ctx)` runs once, synchronously, while the server
 * boots, and resolves configured paths that may not exist yet. The async
 * primitives in `contain-realpath.ts` cannot serve it, and without this
 * module such a call could only be lexical. It is the one place core
 * follows symlinks synchronously, which is why it lives apart from the
 * async primitives that request-time code uses.
 */
import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { resolveAgainstRoots, type IContainedPath } from './contain-path';
import { isInsideRealRoot } from './contain-realpath';

/** Synchronous {@link realResolvePath}, for code that cannot await. */
export const realResolvePathSync = (abs: string): string => {
	try {
		return realpathSync(abs);
	} catch {
		const parent = dirname(abs);
		if (parent === abs) return abs;
		return join(realResolvePathSync(parent), basename(abs));
	}
};

/** Synchronous {@link realpathContained}. */
export const realpathContainedSync = (
	absTarget: string,
	roots: readonly string[],
): boolean => {
	const realTarget = realResolvePathSync(absTarget);
	return roots.some((root) => {
		let realRoot: string;
		try {
			realRoot = realpathSync(root);
		} catch {
			realRoot = resolve(root);
		}
		return isInsideRealRoot(realTarget, realRoot);
	});
};

/**
 * PHYSICAL containment that neither awaits nor requires the target to
 * exist: the lexical check, then the real location of the deepest existing
 * prefix. It serves a synchronous `register(ctx)` resolving a configured
 * directory or file that may not have been created yet, which the async
 * primitives cannot, and without it such a call could only be lexical.
 *
 * The same caveat as every primitive here applies: a symlink swapped in
 * after the check is the host sandbox's to own, so a writer still guards
 * the write itself.
 */
export const resolveWorkspaceContainedPhysicalSync = (
	workspaceRootAbs: string,
	child: string,
	authorizedRoots: readonly string[] = [],
): IContainedPath => {
	const lexical = resolveAgainstRoots(
		workspaceRootAbs,
		authorizedRoots,
		child,
	);
	if (!lexical.ok) {
		return lexical;
	}
	if (
		!realpathContainedSync(lexical.abs, [
			workspaceRootAbs,
			...authorizedRoots,
		])
	) {
		return {
			ok: false,
			abs: lexical.abs,
			rel: lexical.rel,
			reason: `path escapes workspace via symlink: ${child}`,
		};
	}
	return lexical;
};
