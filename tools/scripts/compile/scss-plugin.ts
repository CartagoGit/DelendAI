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
	name: 'mcp-vertex-scss',
	setup(build) {
		build.onResolve({ filter: SCSS_FILTER }, (args) => {
			const cleanPath = args.path.split('?')[0] ?? args.path;
			return {
				path: resolve(args.resolveDir, cleanPath),
				namespace: 'mcp-vertex-scss',
			};
		});

		build.onLoad(
			{ filter: SCSS_FILTER, namespace: 'mcp-vertex-scss' },
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
