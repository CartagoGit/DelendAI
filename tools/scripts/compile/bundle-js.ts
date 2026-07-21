#!/usr/bin/env bun
/**
 * bundle-js.ts — the JS-bundle step of `build.script.ts`, run as a
 * `Bun.build()` call instead of the `bun build` CLI.
 *
 * Why this exists (a00065): `bun build` (the CLI) does not load the
 * repo's `scssPlugin`, so an `import { compiledCss } from './x.scss'`
 * is handed to Bun's built-in CSS handling. Bun ≥1.3.x treats a bare
 * `.scss` import as a native CSS module with only a default export, so
 * the named `compiledCss` import fails to resolve —
 * `packages/ui-extension` (the only package with `.scss` imports)
 * stopped building, which silently broke `bun run build` and therefore
 * the whole release/pack path. `Bun.build({ plugins: [scssPlugin] })`
 * compiles the SCSS to the string module the source expects, so this
 * helper produces byte-for-byte the same dist the CLI used to, plus the
 * SCSS support the CLI never had. Invoked (spawned) by
 * `build.script.ts` so that file's control flow stays synchronous.
 *
 * Usage (all paths relative to --cwd):
 *   bun tools/scripts/compile/bundle-js.ts \
 *     --cwd <pkgDir> --target <node|bun> --root src --outdir dist \
 *     --entry src/index.ts [--entry src/public/index.ts ...]
 */
import { resolve } from 'node:path';

import { scssPlugin } from './scss-plugin';

interface IArgs {
	readonly cwd: string;
	readonly target: 'node' | 'bun';
	readonly root: string;
	readonly outdir: string;
	readonly entries: string[];
}

const parseArgs = (argv: readonly string[]): IArgs => {
	let cwd = '.';
	let target: 'node' | 'bun' = 'node';
	let root = 'src';
	let outdir = 'dist';
	const entries: string[] = [];
	for (let i = 0; i < argv.length; i += 1) {
		const flag = argv[i];
		const value = argv[i + 1];
		switch (flag) {
			case '--cwd':
				cwd = value ?? cwd;
				i += 1;
				break;
			case '--target':
				target = value === 'bun' ? 'bun' : 'node';
				i += 1;
				break;
			case '--root':
				root = value ?? root;
				i += 1;
				break;
			case '--outdir':
				outdir = value ?? outdir;
				i += 1;
				break;
			case '--entry':
				if (value !== undefined) entries.push(value);
				i += 1;
				break;
			default:
				break;
		}
	}
	if (entries.length === 0) {
		throw new Error('bundle-js: at least one --entry is required');
	}
	return { cwd, target, root, outdir, entries };
};

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	const result = await Bun.build({
		entrypoints: args.entries.map((e) => resolve(args.cwd, e)),
		target: args.target,
		format: 'esm',
		packages: 'external',
		outdir: resolve(args.cwd, args.outdir),
		root: resolve(args.cwd, args.root),
		plugins: [scssPlugin],
	});
	if (!result.success) {
		for (const log of result.logs) {
			process.stderr.write(`${log.message}\n`);
		}
		return 1;
	}
	return 0;
};

process.exit(await main());
