/**
 * brand-logos.ts — resolve the actual `<base>.<ext>` path for
 * each brand logo in `public/logos/`.
 *
 * Why this exists (x128):
 *   Different brands ship different formats. npm, pnpm, yarn,
 *   bun, deno, cursor, vscode publish SVG. github, node,
 *   typescript, mcp, zed publish PNG. claude, antigravity,
 *   windsurf publish only ICO. We can't hard-code the
 *   extension in the Install component because the list
 *   changes whenever a project's CDN switches format.
 *
 *   This module reads `public/logos/` at build time and
 *   returns the right path for any brand id. Astro runs
 *   this in Node during static generation, so a one-time
 *   readdir is cheap and never blocks the client.
 *
 * f00069 S5 — extended the kind union to six (`pm`, `ide`,
 *   `plugin`, `lang`, `section`, `lib`) and replaced the
 *   inline `kind === 'ide'` ternary with a data-driven
 *   `KIND_PREFIX` map so adding a new kind is one line.
 *   Every Astro component that needs a brand mark MUST go
 *   through `brandLogo(id, kind)` — never hardcode
 *   `/logos/<prefix>-${id}.${ext}` again.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path to the public logos directory.
 *
 * Why not `process.cwd()`: Astro runs with `cwd === apps/web`
 * (the package root), but vitest and other tooling run from the
 * monorepo root, so `process.cwd()` is environment-dependent and
 * fragile. Anchoring on this module's own location makes the
 * resolver correct in every consumer — Astro frontmatter,
 * server scripts, vitest specs — without callers having to set
 * `process.chdir()` or pass a path explicitly.
 *
 * Layout: `apps/web/src/lib/brand-logos.ts`
 *       → `apps/web/public/logos/`
 * i.e. walk two parents up from this file (lib → src → web), then
 * descend into `public/logos`.
 */
const _HERE = fileURLToPath(import.meta.url);
const PUBLIC_LOGOS = join(dirname(_HERE), '..', '..', 'public', 'logos');

/**
 * Accepted extensions, in priority order. SVG first (lightest
 * + the one most projects publish), PNG second, ICO last
 * (legacy format with limited non-favicon browser support).
 */
const EXTS = ['svg', 'png', 'ico'] as const;

/**
 * Every kind of brand mark the resolver knows about. Each
 * maps to a filename prefix via `KIND_PREFIX`. Adding a new
 * kind is a one-line map entry plus (optionally) a new file
 * family in `public/logos/`.
 *
 *   - `pm`     → package managers (`npm`, `pnpm`, `yarn`, …)
 *   - `ide`    → editors / IDE hosts (`vscode`, `cursor`, …)
 *   - `plugin` → `@mcp-vertex/<slug>` brand marks
 *   - `lang`   → programming-language marks (e.g. `lang-vue.svg`)
 *   - `section`→ neutral section pictograms (`section-plugins.svg`)
 *   - `lib`    → unprefixed runtime / lib marks (`github.png`,
 *                `node.png`, `typescript.png`, `git.svg`,
 *                `modelcontextprotocol.png`)
 */
export type LogoKind = 'pm' | 'ide' | 'plugin' | 'lang' | 'section' | 'lib';

/**
 * Data-driven filename prefix per kind. The empty string means
 * the file lives at `/logos/<id>.<ext>` (no separator prefix).
 *
 * Kept as a `Record<LogoKind, string>` rather than a conditional
 * because: (a) TypeScript guarantees every kind has a prefix
 * (add a key, no `else` branch to forget), (b) adding a new kind
 * is a single line, and (c) the resolver stays branchless.
 */
export const KIND_PREFIX: Record<LogoKind, string> = {
	pm: '',
	ide: 'ide-',
	plugin: 'plugin-',
	lang: 'lang-',
	section: 'section-',
	lib: '',
};

/**
 * Return the public URL for a brand logo, or `null` if no
 * file exists for the given id under the given kind's prefix.
 *
 * Resolves at Astro build time (Node, sync FS); the same call
 * site stays safe inside `.astro` frontmatter, server scripts,
 * and tests. Returns `null` (never throws) when the directory
 * is missing or no extension matches — callers handle the
 * fallback (first-letter circular badge).
 */
export const brandLogo = (id: string, kind: LogoKind = 'pm'): string | null => {
	const prefix = KIND_PREFIX[kind];
	for (const ext of EXTS) {
		const file = `${prefix}${id}.${ext}`;
		if (existsSync(join(PUBLIC_LOGOS, file))) {
			return `/logos/${file}`;
		}
	}
	return null;
};

/**
 * List every brand logo currently in `public/logos/` with
 * its format. Used by tests and the script that fetches
 * new logos (so it knows what's missing).
 */
export const brandLogosInventory = (): ReadonlyArray<{
	readonly file: string;
	readonly ext: 'svg' | 'png' | 'ico' | 'other';
}> => {
	if (!existsSync(PUBLIC_LOGOS)) return [];
	return readdirSync(PUBLIC_LOGOS)
		.filter((f) => f !== '.gitkeep')
		.map((file) => {
			const dot = file.lastIndexOf('.');
			const ext = dot >= 0 ? file.slice(dot + 1) : 'other';
			return { file, ext: ext as 'svg' | 'png' | 'ico' | 'other' };
		})
		.sort((a, b) => a.file.localeCompare(b.file));
};
