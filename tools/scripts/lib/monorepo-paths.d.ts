#!/usr/bin/env bun
/** Groups the monorepo recognises, in the order they appear in the tree. */
export type MonorepoGroup = 'apps' | 'plugins' | 'packages' | 'extensions';
/** Anything that can live in one of those groups. */
export type MonorepoArtifact = string;
/**
 * Resolve the repo root from `git rev-parse --show-toplevel`. Honours the
 * current working directory, so linked worktrees report their own toplevel
 * instead of the main worktree's path.
 *
 * The fallback (using `import.meta.url`) is for environments where git
 * is not on PATH or where the script is run outside a checkout (e.g. a
 * downloaded single-file bundle).
 */
export declare const repoRoot: () => string;
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
export declare const packageBuildDir: (
	group: MonorepoGroup,
	name: string,
) => string;
/**
 * Absolute path to the monorepo-wide build output (a directory that is
 * NEVER tracked). Examples: `build/docs-api/`, `build/apps/web/`.
 */
export declare const buildDir: (group: MonorepoGroup, name: string) => string;
/** Absolute path to a versioned artefact directory under `build/`. */
export declare const buildVersionDir: (
	group: MonorepoGroup,
	name: string,
	version: string,
) => string;
/** Absolute path to one versioned build artefact under `build/`. */
export declare const buildArtifactPath: (
	group: MonorepoGroup,
	name: string,
	version: string,
	artifact: string,
) => string;
/**
 * Absolute path to the monorepo-wide distributable directory. The version
 * is preserved in the path so historical artefacts can be inspected
 * locally without overwriting each other.
 *
 *   dist/<group>/<name>/<version>/
 */
export declare const distVersionDir: (
	group: MonorepoGroup,
	name: string,
	version: string,
) => string;
/**
 * Absolute path to a single distributable artefact under the version dir.
 *
 *   dist/<group>/<name>/<version>/<artifact>
 */
export declare const distArtifactPath: (
	group: MonorepoGroup,
	name: string,
	version: string,
	artifact: string,
) => string;
/**
 * A name that lives directly under `build/` without a group prefix
 * (e.g. `build/docs-api/`). Use this for top-level tooling outputs that
 * don't belong to any particular package.
 */
export declare const buildTopLevel: (name: string) => string;
/**
 * The single canonical cache root for this repo: ALWAYS the root
 * `<repo-root>/.cache/delendai` (f00065 S2). There is no per-folder,
 * per-app, or per-package cache — every runtime-generated delendai state
 * lives under this one directory.
 *
 * The workspace-relative segment (`.cache/delendai`) is reused from core's
 * `DEFAULT_CORE_PATHS.cacheDir` so the path is defined exactly once across the
 * runtime engine and the tooling, the same single-source-of-truth pattern as
 * `skill-paths.ts`. Tools that need to read/clean the cache resolve it here;
 * the runtime engine resolves it from `DEFAULT_CORE_PATHS` joined to its
 * workspace. The `check-cache` lint guarantees no stray `.cache` ever appears
 * outside this root.
 */
export declare const cacheRoot: () => string;
/** Workspace-relative canonical cache dir (`.cache/delendai`). */
export declare const CACHE_DIR_REL: string;
/**
 * Stable well-known names. These are the few directories the rest of the
 * repo references by name. Every other build / dist path SHOULD be
 * derived from the helpers above so it survives renames.
 */
export declare const WELL_KNOWN: {
	/** typedoc output, served at /api/ by Astro via a symlink. */
	readonly docsApi: () => string;
	/** Astro static site output, served by GitHub Pages. */
	readonly webApp: () => string;
	/** VS Code extension build output. */
	readonly vscode: () => string;
	/** VS Code packaged .vsix output under the canonical build tree. The flat `name` in
	 *  `extensions/vscode/package.json` is kept as `delendai-vscode`
	 *  because `vsce` rejects scoped names; the `displayName` is the
	 *  new `@delendai/extension-vscode` for users. The packaging
	 *  script reads `manifest.name` to compute this directly, so this
	 *  helper is the second-source-of-truth for tests + documentation. */
	readonly vscodeVsix: (version: string) => string;
};
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
export declare const relativeFrom: (
	linkDir: string,
	targetDir: string,
) => string;
/**
 * Validate a candidate package name against the same rules used by
 * `assertSafeName`, but as a one-shot predicate (no throw). Useful in
 * scaffolders / linters that want to report all errors instead of
 * failing on the first one.
 */
export declare const isSafeName: (name: string) => boolean;
/**
 * Validate a candidate group name. Useful for the same reason as
 * `isSafeName`.
 */
export declare const isSafeGroup: (group: string) => group is MonorepoGroup;
/**
 * Read a JSON file and return its parsed contents. Used by packaging /
 * scaffolding scripts to pull the `version` from each app's
 * `package.json` without inventing a config format. Re-throws with a
 * path-qualified message so failures are easy to debug.
 */
export declare const readJSON: <T = unknown>(path: string) => T;
