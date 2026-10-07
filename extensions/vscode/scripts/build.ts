#!/usr/bin/env bun
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scssPlugin } from '../../../tools/scripts/compile/scss-plugin';
import { WELL_KNOWN } from '../../../tools/scripts/lib/monorepo-paths.ts';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
		plugins: [scssPlugin],
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
