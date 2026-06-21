#!/usr/bin/env bun
/**
 * monorepo-paths.ts — single source of truth for the monorepo build /
 * dist layout.
 *
 * Why this module exists
 * ----------------------
 * The repo publishes and ships artefacts from three different layouts,
 * and confusing them silently breaks consumers:
 *
 *   1. `packages/[name]/dist/`  +  `plugins/[name]/dist/` — per-package
 *      publishable surfaces. Each `package.json#exports` points there.
 *      Intentionally TRACKED in git. Renaming/moving this would break
 *      every downstream consumer.
 *
 *   2. `build/<group>/<name>/` — monorepo-wide bundler/compiler outputs.
 *      NEVER TRACKED. Examples today: `build/docs-api/` (typedoc),
 *      `build/apps/web/` (Astro).
 *
 *   3. `dist/<group>/<name>/<version>/<artifact>` — monorepo-wide
 *      distributable artefacts. NEVER TRACKED. Examples today:
 *      `dist/apps/vscode/<version>/<name>.vsix`.
 *
 * Any script, package.json script, or CI workflow that needs to compute
 * one of these paths MUST import from this module. Hard-coding
 * `../../dist/apps/...` or `'build/docs-api'` in scattered places is
 * exactly the drift this module prevents — when we add a new app/plugin/
 * package, you just call `buildDir('apps', 'my-new-app')` and the layout
 * follows the convention.
 *
 * Invariants
 * ----------
 * - `repoRoot()` returns the worktree the caller is currently in
 *   (`git rev-parse --show-toplevel`), NOT the symlink/real path of this
 *   file. That matters when the script runs from a linked worktree.
 * - All returned paths are absolute.
 * - Path segments passed in are validated to be lowercase, kebab-safe,
 *   and free of `..` traversal. The module does not silently allow
 *   malformed names because a typo in `apps/vscode` is exactly the
 *   class of bug we're trying to prevent.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

/** Groups the monorepo recognises, in the order they appear in the tree. */
export type MonorepoGroup = 'apps' | 'plugins' | 'packages' | 'examples';

const VALID_GROUPS = new Set<MonorepoGroup>([
	'apps',
	'plugins',
	'packages',
	'examples',
]);

/** Anything that can live in one of those groups. */
export type MonorepoArtifact = string;

/**
 * Names that are safe to embed in a path: lowercase letters, digits,
 * hyphens, dots, underscores, plus signs (npm allows a small set). We
 * reject `/`, `\`, `..`, `~`, leading dots, and any uppercase so that
 * a typo cannot silently write to `apps/Web/dist/`.
 */
const NAME_PATTERN = /^[a-z0-9][a-z0-9._+-]*$/;

const assertSafeName = (kind: string, name: string): void => {
	if (typeof name !== 'string' || name.length === 0) {
		throw new Error(
			`${kind} must be a non-empty string, got ${JSON.stringify(name)}`,
		);
	}
	if (!NAME_PATTERN.test(name)) {
		throw new Error(
			`${kind} ${JSON.stringify(name)} is not a valid monorepo name. ` +
				`Allowed: lowercase letters, digits, hyphens, dots, underscores, plus signs, ` +
				`must not start with a dot. (Tip: don't pass a path — pass just the leaf name.)`,
		);
	}
	if (name.includes('..') || name.includes('/') || name.includes('\\')) {
		throw new Error(
			`${kind} ${JSON.stringify(name)} contains path traversal.`,
		);
	}
};

const assertSafeGroup = (group: string): asserts group is MonorepoGroup => {
	if (!VALID_GROUPS.has(group as MonorepoGroup)) {
		throw new Error(
			`Unknown monorepo group ${JSON.stringify(group)}. ` +
				`Expected one of: ${[...VALID_GROUPS].join(', ')}.`,
		);
	}
};

/**
 * Resolve the repo root from `git rev-parse --show-toplevel`. Honours the
 * current working directory, so linked worktrees report their own toplevel
 * instead of the main worktree's path.
 *
 * The fallback (using `import.meta.url`) is for environments where git
 * is not on PATH or where the script is run outside a checkout (e.g. a
 * downloaded single-file bundle).
 */
export const repoRoot = (): string => {
	try {
		const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
			cwd: process.cwd(),
			encoding: 'utf8',
		});
		if (r.status === 0) {
			const out = (r.stdout ?? '').trim();
			if (out.length > 0) return out;
		}
	} catch {
		// fall through
	}
	// Fallback: derive from the script's own location. Works for the main
	// worktree; will resolve to the main worktree even from a linked one.
	const here = new URL(import.meta.url);
	const path = `${here.protocol === 'file:' ? '' : ''}${here.pathname}`;
	const segments = path.split(sep).filter((s) => s.length > 0);
	// tools/scripts/lib/monorepo-paths.ts → repo root is 4 levels up
	const tail = segments.slice(0, -4);
	return sep + tail.join(sep);
};

/**
 * Absolute path to the per-package build output (a directory that lives
 * inside the package and is INTENTIONALLY tracked, because its
 * `package.json#exports` points there). This is the layout that
 * downstream consumers import from.
 *
 *   packages/<name>/dist
 *   plugins/<name>/dist
 *
 * Apps do NOT use this layout — their build output goes to the
 * monorepo-wide `buildDir('apps', <name>)`.
 */
export const packageBuildDir = (group: MonorepoGroup, name: string): string => {
	assertSafeGroup(group);
	assertSafeName('name', name);
	return join(repoRoot(), group, name, 'dist');
};

/**
 * Absolute path to the monorepo-wide build output (a directory that is
 * NEVER tracked). Examples: `build/docs-api/`, `build/apps/web/`.
 */
export const buildDir = (group: MonorepoGroup, name: string): string => {
	assertSafeGroup(group);
	assertSafeName('name', name);
	return join(repoRoot(), 'build', group, name);
};

/**
 * Absolute path to the monorepo-wide distributable directory. The version
 * is preserved in the path so historical artefacts can be inspected
 * locally without overwriting each other.
 *
 *   dist/<group>/<name>/<version>/
 */
export const distVersionDir = (
	group: MonorepoGroup,
	name: string,
	version: string,
): string => {
	assertSafeGroup(group);
	assertSafeName('name', name);
	if (typeof version !== 'string' || version.length === 0) {
		throw new Error(
			`version must be a non-empty string, got ${JSON.stringify(version)}`,
		);
	}
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(version)) {
		throw new Error(
			`version ${JSON.stringify(version)} is not a valid semver-shaped string.`,
		);
	}
	return join(repoRoot(), 'dist', group, name, version);
};

/**
 * Absolute path to a single distributable artefact under the version dir.
 *
 *   dist/<group>/<name>/<version>/<artifact>
 */
export const distArtifactPath = (
	group: MonorepoGroup,
	name: string,
	version: string,
	artifact: string,
): string => {
	if (typeof artifact !== 'string' || artifact.length === 0) {
		throw new Error(`artifact must be a non-empty string`);
	}
	if (
		artifact.includes('/') ||
		artifact.includes('\\') ||
		artifact.includes('..')
	) {
		throw new Error(
			`artifact ${JSON.stringify(artifact)} contains path traversal.`,
		);
	}
	return join(distVersionDir(group, name, version), artifact);
};

/**
 * A name that lives directly under `build/` without a group prefix
 * (e.g. `build/docs-api/`). Use this for top-level tooling outputs that
 * don't belong to any particular package.
 */
export const buildTopLevel = (name: string): string => {
	assertSafeName('top-level build name', name);
	return join(repoRoot(), 'build', name);
};

/**
 * Stable well-known names. These are the few directories the rest of the
 * repo references by name. Every other build / dist path SHOULD be
 * derived from the helpers above so it survives renames.
 */
export const WELL_KNOWN = {
	/** typedoc output, served at /api/ by Astro via a symlink. */
	docsApi: () => buildTopLevel('docs-api'),
	/** Astro static site output, served by GitHub Pages. */
	webApp: () => buildDir('apps', 'web'),
	/** VS Code extension dist. */
	vscode: () => buildDir('apps', 'vscode'),
	/** VS Code packaged .vsix output. */
	vscodeVsix: (version: string) =>
		distArtifactPath(
			'apps',
			'vscode',
			version,
			`mcp-vertex-vscode-${version}.vsix`,
		),
} as const;

/**
 * Compute the relative symlink target from the symlink path `linkDir` to
 * `targetDir`. The returned string is intended to be stored as the body
 * of a symlink at `linkDir`; it is interpreted relative to
 * `dirname(linkDir)`.
 *
 * We avoid Node's `path.relative` because it returns paths like
 * `../../../foo` even when both endpoints share a common ancestor at
 * the FS root (the extra `../` escapes the mount). This implementation
 * climbs manually through `repoRoot()`.
 */
export const relativeFrom = (linkDir: string, targetDir: string): string => {
	const root = repoRoot();
	// Count the climb from the symlink's PARENT (not from the symlink
	// itself) up to the repo root. The symlink lives at `linkDir`; the
	// symlink target is interpreted relative to `dirname(linkDir)`.
	const linkParentParts = dirname(linkDir)
		.split(sep)
		.filter((p) => p.length > 0);
	const rootParts = root.split(sep).filter((p) => p.length > 0);
	const climb = linkParentParts.length - rootParts.length;
	if (targetDir === root) {
		if (climb <= 0) return '.';
		if (climb === 1) return '..';
		return '../'.repeat(climb).replace(/\/+$/, '');
	}
	if (targetDir.startsWith(root + sep)) {
		const descend = targetDir.slice(root.length + 1);
		if (climb <= 0) return descend;
		return '../'.repeat(climb) + descend;
	}
	// Target lives outside the repo — fall back to absolute, callers
	// usually want the absolute path here anyway.
	return targetDir;
};

/**
 * Validate a candidate package name against the same rules used by
 * `assertSafeName`, but as a one-shot predicate (no throw). Useful in
 * scaffolders / linters that want to report all errors instead of
 * failing on the first one.
 */
export const isSafeName = (name: string): boolean => {
	if (typeof name !== 'string' || name.length === 0) return false;
	if (!NAME_PATTERN.test(name)) return false;
	if (name.includes('..') || name.includes('/') || name.includes('\\'))
		return false;
	return true;
};

/**
 * Validate a candidate group name. Useful for the same reason as
 * `isSafeName`.
 */
export const isSafeGroup = (group: string): group is MonorepoGroup =>
	VALID_GROUPS.has(group as MonorepoGroup);

/**
 * Read a JSON file and return its parsed contents. Used by packaging /
 * scaffolding scripts to pull the `version` from each app's
 * `package.json` without inventing a config format. Re-throws with a
 * path-qualified message so failures are easy to debug.
 */
export const readJSON = <T = unknown>(path: string): T => {
	try {
		const raw = readFileSync(path, 'utf8');
		return JSON.parse(raw) as T;
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`Could not read JSON at ${path}: ${reason}`);
	}
};
