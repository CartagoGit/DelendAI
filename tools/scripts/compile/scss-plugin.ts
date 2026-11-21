import type { BunPlugin } from 'bun';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileString } from 'sass';

const SCSS_FILTER = /\.scss(\?raw)?$/;

/**
 * Compiles SCSS imports to JavaScript string modules for Bun bundles.
 *
 * Both exports are intentional: shared style wrappers use `compiledCss`,
 * while direct consumers may use the default export. Keeping this plugin in
 * tooling gives development previews and production extension builds exactly
 * the same stylesheet semantics without shipping Sass in either bundle.
 */
export const scssPlugin: BunPlugin = {
	name: 'delendai-scss',
	setup(build) {
		build.onResolve({ filter: SCSS_FILTER }, (args) => {
			const cleanPath = args.path.split('?')[0] ?? args.path;
			// x00162 S1: `resolveDir` is typed as always a string, but a
			// globally `Bun.plugin()`-registered instance (as opposed to
			// one passed to `Bun.build()`) can invoke this hook with it
			// empty for some import chains — reproduced live under
			// `bun test --preload`. `importer` (the file doing the
			// importing) is populated in that case, so fall back to its
			// directory.
			const baseDir =
				typeof args.resolveDir === 'string' && args.resolveDir !== ''
					? args.resolveDir
					: dirname(args.importer);
			return {
				path: resolve(baseDir, cleanPath),
				namespace: 'delendai-scss',
			};
		});

		build.onLoad(
			{ filter: SCSS_FILTER, namespace: 'delendai-scss' },
			async (args) => {
				const source = await readFile(args.path, 'utf8');
				let compiledCss: string;
				try {
					compiledCss = compileString(source, {
						url: pathToFileURL(args.path),
						loadPaths: [dirname(args.path)],
					}).css;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(
						`SCSS compile failed in ${args.path}: ${message}`,
					);
				}

				return {
					contents: `const compiledCss = ${JSON.stringify(compiledCss)};\nexport { compiledCss };\nexport default compiledCss;`,
					loader: 'js',
				};
			},
		);
	},
};
