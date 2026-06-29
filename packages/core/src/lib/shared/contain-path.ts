import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Result of {@link resolveWorkspaceContained}. */
export interface IContainedPath {
	/** `true` when `child` stays inside the workspace root. */
	readonly ok: boolean;
	/** Resolved absolute path. Only meaningful when `ok` is `true`. */
	readonly abs: string;
	/** Normalized path relative to the root (forward slashes). */
	readonly rel: string;
	/** Why the path was rejected (only set when `ok` is `false`). */
	readonly reason?: string;
}

/**
 * Resolve `child` against the absolute workspace `rootAbs` and guarantee the
 * result stays **inside** the workspace.
 *
 * The path contract for workspace-scoped inputs (e.g. a read-only plugin's
 * `roots` or a `manifest` path) is "relative to the workspace root". This helper
 * enforces that contract lexically: it rejects absolute paths and any `..`
 * traversal that escapes the root, so a malicious or mistaken `roots: ['..']`
 * cannot make a read-only tool catalog or read files outside what the host meant
 * to expose.
 *
 * Note: containment is lexical (no `realpath`), which covers the `..`/absolute
 * vectors. Symlinks that point outside the workspace are a deeper follow-up and
 * should be guarded by the host's filesystem sandbox.
 */
export const resolveWorkspaceContained = (
	rootAbs: string,
	child: string,
): IContainedPath => {
	const root = resolve(rootAbs);
	if (isAbsolute(child)) {
		return {
			ok: false,
			abs: child,
			rel: child,
			reason: `absolute path not allowed: ${child}`,
		};
	}
	const abs = resolve(root, child);
	const rel = relative(root, abs).split(sep).join('/');
	if (rel === '..' || rel.startsWith('../')) {
		return {
			ok: false,
			abs,
			rel,
			reason: `path escapes workspace: ${child}`,
		};
	}
	return { ok: true, abs, rel: rel === '' ? '.' : rel };
};

/**
 * Lexical containment of `child` inside a single `rootAbs`, *allowing*
 * an absolute `child` as long as it resolves inside the root. This is
 * the per-root primitive {@link resolveAgainstRoots} composes; it is
 * deliberately separate from {@link resolveWorkspaceContained}, which
 * rejects absolute paths outright because the workspace contract is
 * "relative path only".
 *
 * Returns `ok:false` (without a reason) when the path escapes the
 * root, so the caller can keep trying the next authorized root before
 * deciding on a final rejection message.
 */
const containWithinRoot = (rootAbs: string, child: string): IContainedPath => {
	const root = resolve(rootAbs);
	// `resolve(root, child)` ignores `root` when `child` is absolute, so
	// an absolute path is validated against this root by the same `..`
	// containment check as a relative one — no special case needed.
	const abs = resolve(root, child);
	const rel = relative(root, abs).split(sep).join('/');
	if (rel === '..' || rel.startsWith('../')) {
		return { ok: false, abs, rel };
	}
	return { ok: true, abs, rel: rel === '' ? '.' : rel };
};

/**
 * Resolve `child` against the workspace root first, then each of the
 * `authorizedRoots` in order, returning the first containment hit.
 *
 * Contract (f00089 U5 — native authorized-roots allowlist):
 *
 * - With an **empty** `authorizedRoots`, this is byte-identical to
 *   {@link resolveWorkspaceContained}: the workspace check runs first and
 *   an absolute or escaping `child` is rejected with the exact same
 *   `abs`/`rel`/`reason` as before. Every existing caller keeps today's
 *   behaviour.
 * - An **absolute** `child` is permitted **only** when it falls inside the
 *   workspace root or one of the authorized roots; otherwise it is rejected
 *   with the same "absolute path not allowed" message as before.
 * - A **relative** `child` that escapes the workspace is allowed only if it
 *   lands inside an authorized root after resolution; otherwise it is
 *   rejected with the workspace "path escapes" message.
 *
 * Authorization is explicit and durable: `authorizedRoots` comes from the
 * committed `mcp-vertex.config.json` (`filesystem.authorizedRoots`), never
 * from LLM-expanded input. Containment stays lexical (no `realpath`), which
 * covers the `..`/absolute vectors; symlink escape remains the host
 * sandbox's job, exactly as {@link resolveWorkspaceContained} documents.
 */
export const resolveAgainstRoots = (
	workspaceRootAbs: string,
	authorizedRoots: readonly string[],
	child: string,
): IContainedPath => {
	// Workspace root keeps the original strict semantics so the
	// empty-allowlist path is provably identical to the old helper.
	const workspace = resolveWorkspaceContained(workspaceRootAbs, child);
	if (workspace.ok || authorizedRoots.length === 0) {
		return workspace;
	}
	for (const rootAbs of authorizedRoots) {
		const hit = containWithinRoot(rootAbs, child);
		if (hit.ok) return hit;
	}
	// Nothing contained it — surface the workspace rejection reason so the
	// error message (absolute-vs-escape) matches what the caller saw before
	// allowlisting existed.
	return workspace;
};
