/**
 * workspace-ownership.ts — b00239 S5.
 *
 * Decides whether a single entry in a host's global config
 * (Claude Code's `~/.claude.json`, Codex's `~/.codex/config.toml`,
 * future hosts) is demonstrably associated with the workspace being
 * migrated.
 *
 * ## Why this lives outside the migrator
 *
 * The migrator's contract is "only touch owned entries". The
 * predicate that decides ownership is a pure function over
 * `(entry, workspaceRoot)`; making it its own module keeps the
 * migrator narrow (one file: walks files, applies renames) and
 * keeps the predicate independently testable against the three
 * cases the acceptance criterion pins: positive (workspace path
 * present), negative (foreign workspace) and ambiguous (no path
 * at all).
 *
 * ## What "demonstrably associated" means
 *
 * The whole point of S5 is that a workspace migration must NOT
 * rewrite entries in `$HOME/.claude.json` or
 * `$HOME/.codex/config.toml` that belong to other projects. The
 * proof we accept is path-based, and only path-based:
 *
 *   1. The map key for the entry IS the canonical workspace path
 *      (this is the Claude Code / Codex convention: `projects` is
 *      keyed by absolute workspace path).
 *   2. A path-bearing field inside the entry CONTAINS the
 *      canonical workspace path (a `cwd`, a workspace-rooted
 *      `args` entry, a `path` field).
 *   3. The entry references the canonical config file of that
 *      workspace (`<root>/delendai.config.json`).
 *   4. Metadata fields the host exposes for ownership — e.g.
 *      `trust_level` paired with a `name` that names the
 *      workspace — explicitly names the workspace.
 *
 * Anything else is rejected. "The entry has no path" is not a
 * yes; it is the rejection case the acceptance criterion exists
 * to prevent.
 *
 * ## Why not also accept substring or basename matches
 *
 * A workspace called `acme` and a workspace called `acme-legacy`
 * share a substring. A migration that rewrote both because their
 * keys contained `acme` would corrupt one to cure the other.
 * Path-based proof is the only kind that survives a rename of
 * either workspace.
 */

/**
 * The host config schemas we accept. A future host whose entries
 * do not carry any path-bearing field would be rejected here by
 * design: it has no proof of ownership to offer.
 */
export type IOwnershipProof =
	| { readonly kind: 'map-key'; readonly detail: string }
	| { readonly kind: 'value-path'; readonly detail: string }
	| { readonly kind: 'config-path'; readonly detail: string }
	| { readonly kind: 'metadata'; readonly detail: string };

/**
 * One host-config entry as the migrator sees it.
 *
 * `key` is the literal map key the host uses in its `projects` map
 * (Claude Code: absolute workspace path; Codex: absolute workspace
 * path inside `[projects."..."]`).
 *
 * `value` is the payload under that key, walked recursively for
 * path-bearing strings.
 *
 * `metadata` is the host's per-entry bookkeeping (e.g.
 * `trust_level`, `name`, `description`) — the migrator only reads
 * it; rewriting metadata is the per-host migrator's job, not this
 * module's.
 */
export interface IAbstractWorkspaceEntry {
	readonly key: string;
	readonly value: unknown;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The migrator's return value when it asks for ownership. The
 * `proof` field is for diagnostics (`--dry-run`, the manifest
 * emitted by S6) — production callers only need the boolean.
 */
export interface IOwnershipResult {
	readonly owned: boolean;
	readonly proofs: readonly IOwnershipProof[];
}

/** The host's config file is named `delendai.config.json` post-migration. */
export const POST_MIGRATION_CONFIG_BASENAME = 'delendai.config.json';

/** The host's config file was named `delendai.config.json` pre-migration. */
export const PRE_MIGRATION_CONFIG_BASENAME = 'delendai.config.json';

/**
 * Normalise a workspace path so the predicate can compare across:
 *
 *  - trailing separators (`/srv/proj/` vs `/srv/proj`),
 *  - mixed separators (Windows `\` vs POSIX `/`),
 *  - `.` / `..` segments.
 *
 * Pure: no I/O, no shared state. Returns the input untouched
 * when it is already canonical (the common case under POSIX).
 *
 * The output is always a forward-slash-delimited absolute or
 * relative path. On Windows the caller can swap separators back;
 * the predicate's path-anchored check is separator-agnostic
 * because every input is normalised to `/` first.
 */
export const normalizeWorkspacePath = (value: string): string => {
	const backToSlash = value.replaceAll('\\', '/');
	const isAbsolute = backToSlash.startsWith('/');
	const segments = backToSlash.split('/').filter((segment) => segment !== '');
	const collapsed: string[] = [];
	for (const segment of segments) {
		if (segment === '.') continue;
		if (segment === '..') {
			if (
				collapsed.length > 0 &&
				collapsed[collapsed.length - 1] !== '..'
			) {
				collapsed.pop();
				continue;
			}
			// A leading `..` is preserved verbatim — we cannot go
			// above the filesystem root, and a relative path like
			// `../sibling` is meaningful as-is.
			collapsed.push('..');
			continue;
		}
		collapsed.push(segment);
	}
	const joined = collapsed.join('/');
	if (joined === '') return isAbsolute ? '/' : '.';
	return isAbsolute ? `/${joined}` : joined;
};

/**
 * Does `needle` appear as a complete path segment inside `haystack`?
 *
 * A substring match (`/srv/proj` matches `/srv/project`) would
 * rewrite entries for unrelated workspaces whose paths happen to
 * start with the same prefix. This helper anchors the match on
 * path separators so `proj` does not match `project`.
 */
const pathContainsPath = (haystack: string, needle: string): boolean => {
	if (haystack === needle) return true;
	if (!haystack.includes(needle)) return false;
	const index = haystack.indexOf(needle);
	const after = needle.length;
	const charBefore = index === 0 ? '/' : haystack[index - 1];
	const charAfter =
		index + after >= haystack.length ? '/' : haystack[index + after];
	return charBefore === '/' && charAfter === '/';
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Recursively walk an entry's value and yield every leaf string.
 *
 * Strings are yielded with the path of property names that led to
 * them. The caller uses the string to test for path containment;
 * the path is kept so diagnostics can say "the `args[2]` field
 * matched" instead of "somewhere in the entry".
 */
const collectStringLeaves = (
	node: unknown,
	prefix: readonly string[] = [],
): readonly { readonly path: readonly string[]; readonly value: string }[] => {
	if (typeof node === 'string') {
		return [{ path: prefix, value: node }];
	}
	if (Array.isArray(node)) {
		const out: {
			readonly path: readonly string[];
			readonly value: string;
		}[] = [];
		for (let index = 0; index < node.length; index += 1) {
			out.push(
				...collectStringLeaves(node[index], [...prefix, `[${index}]`]),
			);
		}
		return out;
	}
	if (isPlainObject(node)) {
		const out: {
			readonly path: readonly string[];
			readonly value: string;
		}[] = [];
		for (const [key, child] of Object.entries(node)) {
			out.push(...collectStringLeaves(child, [...prefix, key]));
		}
		return out;
	}
	return [];
};

const METADATA_NAMING_KEYS = [
	'name',
	'label',
	'alias',
	'workspaceName',
] as const;

/**
 * Does one of the metadata fields (`name`, `label`, `alias`,
 * `workspaceName`) name the workspace? This is the "fourth proof"
 * the module's header enumerates — a host that records an
 * explicit human-readable name and a path can match either way,
 * and we accept both.
 */
const metadataNamesWorkspace = (
	metadata: Readonly<Record<string, unknown>>,
	canonical: string,
): boolean => {
	for (const key of METADATA_NAMING_KEYS) {
		const value = metadata[key];
		if (typeof value !== 'string') continue;
		if (normalizeWorkspacePath(value) === canonical) return true;
	}
	return false;
};

/**
 * Predicate: is `entry` demonstrably associated with the workspace
 * being migrated?
 *
 * Accepts only path-based proof:
 *
 *   1. map-key == canonical workspace path,
 *   2. a string leaf inside `entry.value` contains the canonical
 *      workspace path (or the canonical config file's path),
 *   3. an entry in `entry.metadata` names the workspace.
 *
 * Rejects everything else. "Has no path at all" is the
 * ambiguous case the acceptance criterion exists to forbid.
 */
export const isOwnedByWorkspace = (
	entry: IAbstractWorkspaceEntry,
	workspaceRoot: string,
): boolean => collectOwnership(entry, workspaceRoot).owned;

/**
 * Same predicate, but returns the proofs it found. Useful for the
 * migration manifest (S6) and `--dry-run` diagnostics.
 */
export const collectOwnership = (
	entry: IAbstractWorkspaceEntry,
	workspaceRoot: string,
): IOwnershipResult => {
	const canonical = normalizeWorkspacePath(workspaceRoot);
	const proofs: IOwnershipProof[] = [];

	if (normalizeWorkspacePath(entry.key) === canonical) {
		proofs.push({
			kind: 'map-key',
			detail: `entry key resolves to the canonical workspace path`,
		});
	}

	const leaves = collectStringLeaves(entry.value);
	for (const leaf of leaves) {
		if (pathContainsPath(leaf.value, canonical)) {
			proofs.push({
				kind: 'value-path',
				detail: `${leaf.path.join('.') || '<root>'} contains the canonical workspace path`,
			});
		}
		const configPath = `${canonical}/${POST_MIGRATION_CONFIG_BASENAME}`;
		if (pathContainsPath(leaf.value, configPath)) {
			proofs.push({
				kind: 'config-path',
				detail: `${leaf.path.join('.') || '<root>'} references the canonical config file`,
			});
		}
	}

	if (entry.metadata !== undefined) {
		if (metadataNamesWorkspace(entry.metadata, canonical)) {
			proofs.push({
				kind: 'metadata',
				detail: 'metadata names the canonical workspace path',
			});
		}
	}

	return { owned: proofs.length > 0, proofs };
};
