#!/usr/bin/env bun
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scssPlugin } from '../../../tools/scripts/compile/scss-plugin';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const buildVsCodeExtension = async (
	outdir = join(EXTENSION_ROOT, 'dist'),
): Promise<BuildOutput> => {
	await rm(outdir, { recursive: true, force: true });
	return Bun.build({
		entrypoints: [join(EXTENSION_ROOT, 'src/extension.ts')],
		target: 'node',
		format: 'cjs',
		external: ['vscode'],
		outdir,
		plugins: [scssPlugin],
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
