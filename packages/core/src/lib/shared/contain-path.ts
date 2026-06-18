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
