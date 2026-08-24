import { isAbsolute, relative, resolve, sep } from 'node:path';

interface IContainmentPathDialect {
	readonly sep: string;
	resolve(...paths: string[]): string;
	relative(from: string, to: string): string;
	isAbsolute(path: string): boolean;
}

const nativePathDialect: IContainmentPathDialect = {
	sep,
	resolve,
	relative,
	isAbsolute,
};

const WINDOWS_CASE_INSENSITIVE = process.platform === 'win32';

const normalizeRelativeSeparators = (
	relativePath: string,
	separator: string,
): string => relativePath.split(separator).join('/');

const foldPathForComparison = (
	pathValue: string,
	caseInsensitive: boolean,
): string => (caseInsensitive ? pathValue.toLowerCase() : pathValue);

const pathEscapesRoot = (
	pathDialect: IContainmentPathDialect,
	relativePathNative: string,
): boolean => {
	const relativePath = normalizeRelativeSeparators(
		relativePathNative,
		pathDialect.sep,
	);
	return (
		pathDialect.isAbsolute(relativePathNative) ||
		relativePath === '..' ||
		relativePath.startsWith('../')
	);
};

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

interface IContainmentOptions {
	readonly caseInsensitive?: boolean;
	readonly pathDialect?: IContainmentPathDialect;
}

/**
 * Pure containment primitive parameterized over a path dialect.
 *
 * The production `resolveWorkspaceContained` / `resolveAgainstRoots`
 * wrappers use the host platform's path semantics. Tests can inject
 * `node:path.win32` to verify Windows drive-letter / UNC behaviour on a
 * non-Windows runner without touching the real filesystem.
 */
const resolveWorkspaceContainedWithDialect = (
	pathDialect: IContainmentPathDialect,
	rootAbs: string,
	child: string,
	options: IContainmentOptions = {},
): IContainedPath => {
	const root = pathDialect.resolve(rootAbs);
	if (pathDialect.isAbsolute(child)) {
		return {
			ok: false,
			abs: child,
			rel: child,
			reason: `absolute path not allowed: ${child}`,
		};
	}
	const abs = pathDialect.resolve(root, child);
	const relNative = pathDialect.relative(root, abs);
	const comparisonRelativeNative = pathDialect.relative(
		foldPathForComparison(root, options.caseInsensitive ?? false),
		foldPathForComparison(abs, options.caseInsensitive ?? false),
	);
	const rel = normalizeRelativeSeparators(relNative, pathDialect.sep);
	if (pathEscapesRoot(pathDialect, comparisonRelativeNative)) {
		return {
			ok: false,
			abs,
			rel,
			reason: `path escapes workspace: ${child}`,
		};
	}
	return { ok: true, abs, rel: rel === '' ? '.' : rel };
};

const containWithinRootForPathDialect = (
	pathDialect: IContainmentPathDialect,
	rootAbs: string,
	child: string,
	options: {
		readonly caseInsensitive?: boolean;
	} = {},
): IContainedPath => {
	const root = pathDialect.resolve(rootAbs);
	const abs = pathDialect.resolve(root, child);
	const relNative = pathDialect.relative(root, abs);
	const comparisonRelativeNative = pathDialect.relative(
		foldPathForComparison(root, options.caseInsensitive ?? false),
		foldPathForComparison(abs, options.caseInsensitive ?? false),
	);
	const rel = normalizeRelativeSeparators(relNative, pathDialect.sep);
	if (pathEscapesRoot(pathDialect, comparisonRelativeNative)) {
		return { ok: false, abs, rel };
	}
	return { ok: true, abs, rel: rel === '' ? '.' : rel };
};

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
	options: IContainmentOptions = {},
): IContainedPath => {
	return resolveWorkspaceContainedWithDialect(
		options.pathDialect ?? nativePathDialect,
		rootAbs,
		child,
		{
			caseInsensitive:
				options.caseInsensitive ?? WINDOWS_CASE_INSENSITIVE,
		},
	);
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
	options: IContainmentOptions = {},
): IContainedPath => {
	const pathDialect = options.pathDialect ?? nativePathDialect;
	const caseInsensitive = options.caseInsensitive ?? WINDOWS_CASE_INSENSITIVE;
	// Workspace root keeps the original strict semantics so the
	// empty-allowlist path is provably identical to the old helper.
	const workspace = resolveWorkspaceContainedWithDialect(
		pathDialect,
		workspaceRootAbs,
		child,
		{ caseInsensitive },
	);
	if (workspace.ok || authorizedRoots.length === 0) {
		return workspace;
	}
	for (const rootAbs of authorizedRoots) {
		const hit = containWithinRootForPathDialect(
			pathDialect,
			rootAbs,
			child,
			{ caseInsensitive },
		);
		if (hit.ok) return hit;
	}
	// Nothing contained it — surface the workspace rejection reason so the
	// error message (absolute-vs-escape) matches what the caller saw before
	// allowlisting existed.
	return workspace;
};
