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
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_LOGOS = join(process.cwd(), 'public', 'logos');

/**
 * Accepted extensions, in priority order. SVG first (lightest
 * + the one most projects publish), PNG second, ICO last
 * (legacy format with limited non-favicon browser support).
 */
const EXTS = ['svg', 'png', 'ico'] as const;

/**
 * Return the public URL for a brand logo, or `null` if no
 * file exists. The `kind` argument is `pm` for package
 * managers (logo at `/logos/<id>.<ext>`) or `ide` for IDEs
 * (logo at `/logos/ide-<id>.<ext>`).
 */
export const brandLogo = (
	id: string,
	kind: 'pm' | 'ide' = 'pm',
): string | null => {
	const prefix = kind === 'ide' ? 'ide-' : '';
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
