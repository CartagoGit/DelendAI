/**
 * typescript-profile.ts — the consumer-facing TypeScript file-convention
 * profile (f00037 S3).
 *
 * This is the plugin's OWN, self-contained encoding of the canonical
 * role rules documented in `docs/FILE-CONVENTIONS.md`. It mirrors the
 * lint-side engine (`tools/scripts/lint/file-conventions.ts`) but stays
 * within the plugin's package boundary so the plugin depends on nothing
 * outside `@mcp-vertex/core` (a plugin must not import from `tools/`).
 * The rule set is tiny (~10 suffix/folder patterns), so the duplication
 * is cheap; `typescript-profile.parity.spec.ts` is the drift guard that
 * keeps the two encodings in lock-step.
 *
 * Architecture (SOLID):
 *   - `IRoleRule` — one rule: a `name` + a pure `match(path)` predicate
 *     (Interface Segregation).
 *   - `TYPESCRIPT_RULES` — the default ordered chain; appending a role
 *     never edits `classifyPath` (Open/Closed).
 *   - `classifyPath(path, rules?)` — pure; first matching rule wins,
 *     else `'other'` (Liskov: rules are interchangeable; Dependency
 *     Inversion: callers depend on `Role`, not on the rule internals).
 */
import { basename } from 'node:path';

/** The closed set of file roles recognised by the f00037 convention. */
export type Role =
	| 'interface'
	| 'constant'
	| 'service'
	| 'tool'
	| 'registry'
	| 'register'
	| 'factory'
	| 'builder'
	| 'generated'
	| 'barrel'
	| 'other';

/** A single rule in the classification chain. */
export interface IRoleRule {
	/** Canonical role name; one of the `Role` literals (except `'other'`). */
	readonly name: Exclude<Role, 'other'>;
	/** Pure predicate over a repo-relative POSIX path (`/` separators). */
	readonly match: (relPath: string) => boolean;
}

const rule = (
	name: IRoleRule['name'],
	match: (rel: string) => boolean,
): IRoleRule => ({ name, match });

/** True if any `/`-segment of the path equals `needle`. */
const hasSegment = (rel: string, needle: string): boolean =>
	rel.split('/').includes(needle);

/** True if `rel`'s basename is exactly `suffix` or ends with `.${suffix}`. */
const endsWithBasename = (rel: string, suffix: string): boolean =>
	basename(rel) === suffix || basename(rel).endsWith(`.${suffix}`);

/**
 * Default rule chain for TypeScript monorepos. Order matters: more
 * specific rules (`generated`, `barrel`) first, suffix/folder role rules
 * second; anything unmatched falls through to `'other'`.
 */
export const TYPESCRIPT_RULES: readonly IRoleRule[] = [
	rule(
		'generated',
		(rel) =>
			hasSegment(rel, 'generated') || /\.generated\./.test(basename(rel)),
	),
	rule('barrel', (rel) => {
		if (basename(rel) !== 'index.ts') return false;
		return (
			rel.endsWith('/src/public/index.ts') ||
			/\/src\/index\.ts$/.test(rel)
		);
	}),
	rule(
		'interface',
		(rel) =>
			hasSegment(rel, 'contracts/interfaces') ||
			/\.interface\.ts$/.test(rel),
	),
	rule(
		'constant',
		(rel) =>
			hasSegment(rel, 'contracts/constants') ||
			/\.constant\.ts$/.test(rel),
	),
	rule(
		'service',
		(rel) =>
			hasSegment(rel, 'services') || endsWithBasename(rel, 'service.ts'),
	),
	rule(
		'tool',
		(rel) => hasSegment(rel, 'tools') || endsWithBasename(rel, 'tool.ts'),
	),
	rule(
		'registry',
		(rel) =>
			hasSegment(rel, 'registry') ||
			hasSegment(rel, 'registries') ||
			endsWithBasename(rel, 'registry.ts'),
	),
	rule(
		'register',
		(rel) =>
			hasSegment(rel, 'register') ||
			hasSegment(rel, 'registers') ||
			endsWithBasename(rel, 'register.ts'),
	),
	rule(
		'factory',
		(rel) =>
			hasSegment(rel, 'factories') || endsWithBasename(rel, 'factory.ts'),
	),
	rule(
		'builder',
		(rel) =>
			hasSegment(rel, 'builders') || endsWithBasename(rel, 'builder.ts'),
	),
];

/**
 * Classify a repo-relative POSIX path into its `Role`. Falls through to
 * `'other'` when no rule matches. POSIX-only; Windows backslashes are
 * normalised defensively. A buggy rule never poisons the chain.
 */
export const classifyPath = (
	relPath: string,
	rules: readonly IRoleRule[] = TYPESCRIPT_RULES,
): Role => {
	if (typeof relPath !== 'string' || relPath.length === 0) return 'other';
	const rel = relPath.replaceAll('\\', '/');
	for (const r of rules) {
		try {
			if (r.match(rel)) return r.name;
		} catch {
			continue;
		}
	}
	return 'other';
};
