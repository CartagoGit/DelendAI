#!/usr/bin/env bun
/**
 * file-conventions.ts — f00037 S1 (engine).
 *
 * Pure path classifier for the `f00037` file convention. Maps a
 * repo-relative path to one of the 11 documented roles. No I/O. No
 * global state. The companion `file-conventions.script.ts` is the only
 * CLI entrypoint that walks the tree; this module is the engine
 * shared with the lint, the docs generator, and (in S3) the
 * consumer-facing `mcpv conventions` profile.
 *
 * Architecture (SOLID):
 *   - `IRoleRule` — one rule in the chain. Each rule declares a name
 *     and a `match(path)` predicate. (Interface Segregation: only
 *     what is needed.)
 *   - `DEFAULT_TS_RULES` — the default rule list for TypeScript
 *     projects. Re-exported so tests and the consumer profile can
 *     compose or replace it. (Open/Closed: add a new role without
 *     editing the classifier.)
 *   - `classifyPath(path, rules?)` — pure function. Returns the first
 *     rule whose `match(path)` returns true, or `'other'` if none.
 *     (Liskov: every rule is interchangeable in the chain.)
 *   - `Role` — the closed union of all known roles. (Dependency
 *     Inversion: callers depend on the role names, not the rules.)
 *
 * Determinism: rule order matters. Earlier rules win; the table in
 * `docs/FILE-CONVENTIONS.md` is the source of truth for the order.
 * `barrel` wins over `other` but loses to role suffixes because role
 * suffixes are more specific.
 */
import { basename } from 'node:path';

/** The closed set of file roles recognised by `f00037`. */
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
	/** Canonical role name; must be one of the `Role` literals. */
	readonly name: Role;
	/** Pure predicate. Repo-relative POSIX path (`/` separators). */
	readonly match: (relPath: string) => boolean;
}

/** Build a rule in one expression for the default table below. */
const rule = (name: Role, match: (rel: string) => boolean): IRoleRule => ({
	name,
	match,
});

/** True if any segment of the path equals `needle`. */
const hasSegment = (rel: string, needle: string): boolean =>
	rel.split('/').includes(needle);

/** True if `rel` ends with the given basename pattern. */
const endsWithBasename = (rel: string, suffix: string): boolean =>
	basename(rel) === suffix || basename(rel).endsWith(`.${suffix}`);

/**
 * Default rule chain for TypeScript monorepos. Order matters: more
 * specific rules first (`generated`, `barrel`); suffix-based role
 * rules second; everything else falls through to `other` (implicit
 * final rule added by `classifyPath`).
 */
export const DEFAULT_TS_RULES: readonly IRoleRule[] = [
	// 1. Generated outputs always win — they are owned by a generator
	//    and exempted from the suffix rule entirely.
	rule(
		'generated',
		(rel) =>
			hasSegment(rel, 'generated') || /\.generated\./.test(basename(rel)),
	),

	// 2. Public barrels — `src/public/index.ts` and `src/index.ts`.
	//    These re-export the package surface and carry no role suffix.
	rule('barrel', (rel) => {
		const base = basename(rel);
		if (base !== 'index.ts') return false;
		return (
			rel.endsWith('/src/public/index.ts') ||
			/\/src\/index\.ts$/.test(rel)
		);
	}),

	// 3. Interface contracts — under `contracts/interfaces/` or `.interface.ts`.
	rule(
		'interface',
		(rel) =>
			hasSegment(rel, 'contracts/interfaces') ||
			/\.interface\.ts$/.test(rel),
	),

	// 4. Constant contracts — under `contracts/constants/` or `.constant.ts`.
	rule(
		'constant',
		(rel) =>
			hasSegment(rel, 'contracts/constants') ||
			/\.constant\.ts$/.test(rel),
	),

	// 5. Services — under `services/` or `.service.ts`.
	rule(
		'service',
		(rel) =>
			hasSegment(rel, 'services') || endsWithBasename(rel, 'service.ts'),
	),

	// 6. MCP tools — under `tools/` or `.tool.ts`. Tools never live at
	//    the package root because the role is project-wide.
	rule(
		'tool',
		(rel) => hasSegment(rel, 'tools') || endsWithBasename(rel, 'tool.ts'),
	),

	// 7. Registries — `.registry.ts` (and `registry/` or `registries/` folder).
	rule(
		'registry',
		(rel) =>
			hasSegment(rel, 'registry') ||
			hasSegment(rel, 'registries') ||
			endsWithBasename(rel, 'registry.ts'),
	),

	// 8. Registration glue — `.register.ts` (and `register/` or `registers/` folder).
	rule(
		'register',
		(rel) =>
			hasSegment(rel, 'register') ||
			hasSegment(rel, 'registers') ||
			endsWithBasename(rel, 'register.ts'),
	),

	// 9. Factories — `.factory.ts` or `factories/` folder.
	rule(
		'factory',
		(rel) =>
			hasSegment(rel, 'factories') || endsWithBasename(rel, 'factory.ts'),
	),

	// 10. Builders — `.builder.ts` or `builders/` folder.
	rule(
		'builder',
		(rel) =>
			hasSegment(rel, 'builders') || endsWithBasename(rel, 'builder.ts'),
	),
];

/**
 * Classify a repo-relative POSIX path. Falls through to `'other'` when
 * no rule matches. POSIX-only (`/` separators) — callers must convert
 * from the host OS before calling.
 *
 * @param relPath - repo-relative POSIX path, e.g. `packages/core/src/lib/tools/foo.tool.ts`
 * @param rules   - optional override rule chain (defaults to `DEFAULT_TS_RULES`)
 */
export const classifyPath = (
	relPath: string,
	rules: readonly IRoleRule[] = DEFAULT_TS_RULES,
): Role => {
	if (typeof relPath !== 'string' || relPath.length === 0) return 'other';
	// Normalise Windows backslashes defensively (lint scripts may be
	// invoked on Windows even though CI is Linux).
	const rel = relPath.replaceAll('\\', '/');
	for (const r of rules) {
		try {
			if (r.match(rel)) return r.name;
		} catch {
			// A buggy rule must not poison the whole chain; skip it.
			continue;
		}
	}
	return 'other';
};
