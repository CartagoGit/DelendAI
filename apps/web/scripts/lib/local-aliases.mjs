/**
 * local-aliases.mjs — single source of truth for `#MAYÚSCULAS/*`
 * project-local imports (p112 s1).
 *
 * Two artefacts share this file so they cannot drift:
 *
 *   - `LOCAL_ALIASES`     — a `Record<string, string>` of absolute
 *                            paths consumed by Vite at runtime
 *                            (`astro.config.mjs#vite.resolve.alias`).
 *   - `TS_CONFIG_PATHS`   — a `Record<string, string[]>` of tsconfig
 *                            `paths`-style entries (relative, prefix-
 *                            glob) consumed by `tsconfig.json#compiler
 *                            Options.paths` at type-check time.
 *
 * Both objects are derived from the same `ALIAS_ROOTS` array (and the
 * shared `REPO_ROOT`) so adding a new alias is a one-line change
 * (SRP: this module declares aliases and nothing else; DRY: a single
 * entry point feeds two consumers).
 *
 * Convention (see `docs/proposals/p112-derive-site-manifests-and-local-
 * aliases.md` §1):
 *
 *   - Filesystem dirs are **kebab/lowercase**.
 *   - Local imports use the `#MAYÚSCULAS/...` prefix (npm subpath
 *     convention; `#` cannot collide with any npm package name).
 *   - Workspace imports keep using `@mcp-vertex/...` (unchanged).
 *
 * The `#MANIFESTS/*` alias points to `data/manifests/*`, which is the
 * post-s3 destination for the two site manifests (skills.json,
 * capabilities.json). Until s3 lands, those JSONs still live at
 * `data/skills.json` and `data/capabilities.json`; consumers that try
 * `#MANIFESTS/skills.json` before s3 will fail to resolve. That is
 * the documented expected behaviour (see p112 §1).
 *
 * `REPO_ROOT` is computed as `<this file>/../../../..` (4 levels up:
 * `lib/` → `scripts/` → `web/apps/` → `web/` → repo). Hard-coding
 * those hops would couple this module to its own filename; using
 * `import.meta.url` + `fileURLToPath` keeps the path resolution
 * filesystem-anchored (DIP: depend on the file's location, not on
 * hard-coded strings).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Repository root, computed from this file's location
 * (`apps/web/scripts/lib/local-aliases.mjs` → 4 dirs up → repo root).
 *
 * Exported so consumers (the sync test in p112 s6, ad-hoc scripts)
 * can derive paths from a single source of truth.
 */
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

/**
 * The six local alias roots, each tied to a filesystem dir under
 * `apps/web/src/` (or `apps/web/scripts/`). The order matches the
 * table in p112 §1 and is intentionally stable so the sync test
 * (s6) can diff keys lexicographically.
 */
const ALIAS_ROOTS = /** @type {const} */ ([
	['#MANIFESTS', 'apps/web/src/data/manifests'],
	['#DATA', 'apps/web/src/data'],
	['#COMPONENTS', 'apps/web/src/components'],
	['#LAYOUTS', 'apps/web/src/layouts'],
	['#I18N', 'apps/web/src/i18n'],
	['#SCRIPTS', 'apps/web/scripts'],
]);

/**
 * Vite-style absolute aliases. The values are absolute paths on the
 * current host, so the build is location-independent (a contributor
 * with the repo checked out anywhere can `bun run build` without
 * tweaking the config).
 */
export const LOCAL_ALIASES = Object.fromEntries(
	ALIAS_ROOTS.map(([alias, relDir]) => [alias, resolve(REPO_ROOT, relDir)]),
);

/**
 * tsconfig-style `paths` entries. Each value is a single-element array
 * of a glob-pattern relative to `apps/web/` (where the project's
 * `tsconfig.json` lives — see p112 §2 s2 for the wiring).
 *
 * Format: `${relDir}/*` matches any file under the directory. The
 * trailing `/*` is required for `paths` to substitute the alias.
 */
export const TS_CONFIG_PATHS = Object.fromEntries(
	ALIAS_ROOTS.map(([alias, relDir]) => {
		// tsconfig is rooted at apps/web/, so the path is relative to
		// that dir (two levels under REPO_ROOT).
		const fromTsconfig = `./${relDir.replace(/^apps\/web\//u, '')}/*`;
		return [alias, [fromTsconfig]];
	}),
);
