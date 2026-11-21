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
 * `--inline <package>` (repeatable) names workspace packages that are
 * NOT published: their code is bundled into this package's output
 * instead of being left as an import nobody could install. Every other
 * bare import stays external, as before. A private package is an
 * implementation detail of whoever ships it, so a feature built on one
 * adds nothing to what a user installs.
 *
 * Usage (all paths relative to --cwd):
 *   bun tools/scripts/compile/bundle-js.ts \
 *     --cwd <pkgDir> --target <node|bun> --root src --outdir dist \
 *     --entry src/index.ts [--entry src/public/index.ts ...] \
 *     [--inline @scope/private-package ...]
 */
import { resolve } from 'node:path';

import type { BunPlugin } from 'bun';

import { scssPlugin } from './scss-plugin';

interface IArgs {
	readonly cwd: string;
	readonly target: 'node' | 'bun';
	readonly root: string;
	readonly outdir: string;
	readonly entries: string[];
	readonly inline: string[];
}

const parseArgs = (argv: readonly string[]): IArgs => {
	let cwd = '.';
	let target: 'node' | 'bun' = 'node';
	let root = 'src';
	let outdir = 'dist';
	const entries: string[] = [];
	const inline: string[] = [];
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
			case '--inline':
				if (value !== undefined) inline.push(value);
				i += 1;
				break;
			default:
				break;
		}
	}
	if (entries.length === 0) {
		throw new Error('bundle-js: at least one --entry is required');
	}
	return { cwd, target, root, outdir, entries, inline };
};

/** The package a bare specifier names: `@scope/name/sub` -> `@scope/name`. */
export const packageOf = (specifier: string): string => {
	const [first = '', second] = specifier.split('/');
	return first.startsWith('@') && second !== undefined
		? `${first}/${second}`
		: first;
};

const BARE_SPECIFIER = /^[^./]/u;

/**
 * Leaves every bare import external except the packages to inline, whose
 * resolution falls through to the bundler. A runtime's own modules
 * (`node:fs`, `bun:sqlite`) are external either way.
 */
const externalExcept = (inline: ReadonlySet<string>): BunPlugin => ({
	name: 'external-except-inlined',
	setup: (build) => {
		build.onResolve({ filter: BARE_SPECIFIER }, (args) =>
			inline.has(packageOf(args.path))
				? undefined
				: { path: args.path, external: true },
		);
	},
});

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	const result = await Bun.build({
		entrypoints: args.entries.map((e) => resolve(args.cwd, e)),
		target: args.target,
		format: 'esm',
		// With nothing to inline this is the old behaviour to the byte.
		...(args.inline.length === 0
			? { packages: 'external' as const }
			: {
					packages: 'bundle' as const,
					// An inlined package is read from its source, the entry
					// its `exports` name under this condition: its `dist`
					// may not be built yet, and is not published either.
					conditions: ['@delendai/source'],
				}),
		outdir: resolve(args.cwd, args.outdir),
		root: resolve(args.cwd, args.root),
		plugins:
			args.inline.length === 0
				? [scssPlugin]
				: [externalExcept(new Set(args.inline)), scssPlugin],
	});
	if (!result.success) {
		for (const log of result.logs) {
			process.stderr.write(`${log.message}\n`);
		}
		return 1;
	}
	return 0;
};

if (import.meta.main) process.exit(await main());
