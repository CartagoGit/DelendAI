#!/usr/bin/env bun
import type { BunPlugin } from 'bun';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scssPlugin } from '../../../tools/scripts/compile/scss-plugin';
import { WELL_KNOWN } from '../../../tools/scripts/lib/monorepo-paths.ts';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The bundler takes a package's `main`, and jsonc-parser's is a UMD file whose
 * `require('./impl/format')` it cannot follow: the bundle kept that call, the
 * file is not in the package, and the extension failed as it loaded. Its ES
 * module build bundles whole.
 */
const jsoncParserAsEsm: BunPlugin = {
	name: 'jsonc-parser-as-esm',
	setup(build) {
		build.onResolve({ filter: /^jsonc-parser$/u }, (args) => ({
			path: join(
				dirname(
					Bun.resolveSync(
						'jsonc-parser/package.json',
						args.resolveDir,
					),
				),
				'lib/esm/main.js',
			),
		}));
	},
};

export const buildVsCodeExtension = async (
	outdir = WELL_KNOWN.vscode(),
): Promise<BuildOutput> => {
	await rm(join(outdir, 'extension.js'), { force: true });
	return Bun.build({
		entrypoints: [join(EXTENSION_ROOT, 'src/extension.ts')],
		target: 'node',
		format: 'esm',
		external: ['vscode'],
		outdir,
		plugins: [scssPlugin, jsoncParserAsEsm],
		// Bun's tree-shaker drops top-level side-effect imports for ESM
		// bundles, so the navigator shim (which mutates `globalThis`
		// at import time) would never run before `zod` evaluates
		// `typeof navigator`. The `banner` runs at the very top of
		// the bundle, before any module body — guaranteed to fire on
		// extension host startup. Keep it dependency-free.
		banner: [
			'/* delendai: node22 navigator shim — must stay first */',
			'try { Object.defineProperty(globalThis, "navigator", { value: undefined, writable: true, configurable: true }); } catch (_) { /* ignore */ }',
		].join('\n'),
	});
};

if (import.meta.main) {
	const outdirFlag = process.argv.indexOf('--outdir');
	const requestedOutdir =
		outdirFlag >= 0 ? process.argv[outdirFlag + 1] : undefined;
	if (outdirFlag >= 0 && requestedOutdir === undefined) {
		throw new Error('--outdir requires a path');
	}
	const result = await buildVsCodeExtension(requestedOutdir);
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		process.exitCode = 1;
	}
}
