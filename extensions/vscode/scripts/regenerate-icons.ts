#!/usr/bin/env bun
/**
 * regenerate-icons.ts — package the delendai logo into a WOFF glyph
 * font + a VS Code product-icon-theme manifest, both consumed by the
 * status bar via the `$(delendai)` codicon reference.
 *
 * Source of truth:
 *   extensions/vscode/media/icons/logo-mono.svg
 *
 * Output:
 *   extensions/vscode/media/icons/delendai-icons.woff
 *   extensions/vscode/media/icons/delendai-product-icon-theme.json
 *
 * Both files are committed as static assets (see package.json
 * `productIconThemes[].path`). Re-run only when the logo changes:
 *
 *     bun run --cwd extensions/vscode regenerate:icons
 *
 * The build is deterministic: webfont assigns unicode `0xE000` to the
 * single glyph ("delendai"), and the JSON points that glyph at the
 * codicon id `delendai` so `$(delendai)` resolves in any label.
 *
 * Why `webfont` (and not a hand-rolled WOFF writer):
 *   WOFF is a wrapper around an SFNT font with a tiny TOC. SFNT
 *   glyph outlines have to be cubic Bezier paths in font units —
 *   converting SVG path data by hand is exactly the kind of work
 *   `webfont` already does correctly. Pulling one devDependency is
 *   cheaper than carrying a font-format encoder we don't otherwise
 *   need.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { webfont } from 'webfont';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = join(HERE, '..', 'media', 'icons');
const SVG_PATH = join(ICON_DIR, 'logo-mono.svg');
const WOFF_PATH = join(ICON_DIR, 'delendai-icons.woff');
const THEME_PATH = join(ICON_DIR, 'delendai-product-icon-theme.json');

// Single codicon id. Keep the array length pinned to one so the
// unicode assignment (0xE000 -> "delendai") stays stable. Adding a
// new glyph means appending here AND extending the JSON below.
const ICON_IDS = ['delendai'] as const;

async function main(): Promise<void> {
	mkdirSync(ICON_DIR, { recursive: true });

	const result = await webfont({
		files: [SVG_PATH],
		formats: ['woff'],
		// Unicode Private Use Area — VS Code codicons live here, so
		// our glyph stays out of the way of future PUA additions.
		startUnicode: 0xe000,
		normalize: true,
		sort: false,
		verbose: false,
	});

	if (!result.woff) {
		throw new Error('webfont returned no WOFF buffer');
	}

	writeFileSync(WOFF_PATH, result.woff);
	console.log(`• wrote ${WOFF_PATH}`);

	const theme = {
		// The font is the only entry in `fonts`. Subsequent entries
		// would need a unique `id`; we keep one so the glyph can be
		// referenced without a `fontId` override in the icon defs.
		fonts: [
			{
				id: 'delendai-icons',
				src: [{ path: './delendai-icons.woff', format: 'woff' }],
				weight: 'normal',
				style: 'normal',
				size: '100%',
			},
		],
		iconDefinitions: {
			// VS Code codicon IDs are camelCase strings. `delendai`
			// is the same id we already use in `$(delendai)` text
			// labels (status bar, walkthroughs, command palette),
			// so adding this theme retroactively fixes every place
			// that referenced the broken `$(delendai)` placeholder.
			[ICON_IDS[0]]: {
				fontCharacter: '\\E000',
				fontId: 'delendai-icons',
			},
		},
	};

	writeFileSync(THEME_PATH, `${JSON.stringify(theme, null, '\t')}\n`);
	console.log(`• wrote ${THEME_PATH}`);
}

main().catch((err: unknown) => {
	console.error('✗ icon font regeneration failed:', err);
	process.exit(1);
});
