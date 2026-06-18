#!/usr/bin/env bun
/**
 * Build driver (M3 — publishable runtime).
 *
 * Each package publishes compiled `dist/`:
 *  - `.js`  bundled with `bun build` (ESM, target node, deps kept external),
 *           so it runs under Node/npm/pnpm/yarn, Deno and bun alike. The
 *           bundler resolves the project's extensionless ("bundler"
 *           moduleResolution) imports that Node ESM could not.
 *  - `.d.ts` emitted by `tsc --emitDeclarationOnly` (cross-package types
 *           resolve via the base `paths`).
 *
 * Dev/tests keep using `src` directly via the vitest aliases — this build is
 * only for what ends up on the registry.
 *
 * Usage: `bun run build` (root) or `bun scripts/build.ts [pkgDir ...]`.
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	readdirSync,
	rmSync,
	writeFileSync,
	unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const discover = (): string[] =>
	['packages', 'plugins'].flatMap((group) =>
		readdirSync(join(ROOT, group))
			.map((name) => join(group, name))
			.filter(
				(rel) =>
					existsSync(join(ROOT, rel, 'package.json')) &&
					existsSync(join(ROOT, rel, 'src', 'index.ts')),
			),
	);

const run = (cmd: string, args: string[], cwd: string): void => {
	const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
	if (r.status !== 0) {
		console.error(`\n✗ ${cmd} ${args.join(' ')} (in ${cwd}) failed`);
		process.exit(r.status ?? 1);
	}
};

const buildPackage = (rel: string): void => {
	const dir = join(ROOT, rel);
	const entries = ['src/index.ts'];
	if (existsSync(join(dir, 'src/public/index.ts')))
		entries.push('src/public/index.ts');
	if (existsSync(join(dir, 'src/cli.ts'))) entries.push('src/cli.ts');

	console.log(
		`\n• ${rel} → dist (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`,
	);
	rmSync(join(dir, 'dist'), { recursive: true, force: true });

	// 1. JS bundles (deps external; bundler-style imports resolved here).
	run(
		'bun',
		[
			'build',
			...entries,
			'--target',
			'node',
			'--format',
			'esm',
			'--packages',
			'external',
			'--outdir',
			'dist',
			'--root',
			'src',
		],
		dir,
	);

	// 2. Type declarations. A throwaway project inherits the base `paths` so
	//    cross-package `@mcp-vertex/*` types resolve from source.
	const dtsConfig = join(dir, 'tsconfig.dts.json');
	// Cross-package `@mcp-vertex/*` types resolve to each dependency's BUILT
	// `dist/*.d.ts` (declaration inputs — not pulled into this package's
	// program, so no `rootDir` violation). Core is the only shared dependency;
	// it is built first. Core itself imports no sibling package.
	const corePaths =
		rel === 'packages/core'
			? {}
			: {
					'@mcp-vertex/core': ['../../packages/core/dist/index.d.ts'],
					'@mcp-vertex/core/public': [
						'../../packages/core/dist/public/index.d.ts',
					],
				};
	writeFileSync(
		dtsConfig,
		JSON.stringify(
			{
				extends: '../../tsconfig.base.json',
				compilerOptions: {
					noEmit: false,
					declaration: true,
					emitDeclarationOnly: true,
					outDir: 'dist',
					rootDir: 'src',
					paths: corePaths,
				},
				include: ['src/**/*'],
				exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
			},
			null,
			'\t',
		),
	);
	try {
		run('bunx', ['tsc', '-p', 'tsconfig.dts.json'], dir);
	} finally {
		unlinkSync(dtsConfig);
	}
};

const targets =
	process.argv.slice(2).length > 0 ? process.argv.slice(2) : discover();
for (const rel of targets) buildPackage(rel);
console.log(`\n✓ Built ${targets.length} package(s).`);
