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
	mkdtempSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Walk up from this file's directory until we find a directory that
// contains `mcp-vertex.config.json` (or `.git`). That is the repo root.
// This is robust against future moves of the script under
// tools/scripts/<area>/<...>.<depth>.script.ts — the ROOT computation
// doesn't break if the file is relocated one or more directories deeper.
const findRepoRoot = (start: string): string => {
	let current = start;
	for (let i = 0; i < 8; i++) {
		if (
			existsSync(join(current, 'mcp-vertex.config.json')) ||
			existsSync(join(current, '.git'))
		) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	// Fallback: assume the repo root is two levels up from the script
	// location (the original convention when the script lived at
	// `scripts/build.ts`). This keeps the script working in environments
	// where neither marker is reachable (e.g. running from a tarball).
	return join(start, '..', '..');
};

const ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

const discover = (): string[] =>
	['packages', 'plugins']
		.flatMap((group) =>
			readdirSync(join(ROOT, group))
				.map((name) => join(group, name))
				.filter(
					(rel) =>
						existsSync(join(ROOT, rel, 'package.json')) &&
						existsSync(join(ROOT, rel, 'src', 'index.ts')),
				),
		)
		.sort((a, b) => buildRank(a) - buildRank(b) || a.localeCompare(b));

const buildRank = (rel: string): number => {
	if (rel === 'packages/core') return 0;
	if (rel.startsWith('packages/')) return 1;
	return 2;
};

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
	const dtsCacheDir = join(dir, 'node_modules/.cache/mcp-vertex-dts');
	mkdirSync(dtsCacheDir, { recursive: true });
	const dtsTempDir = mkdtempSync(join(dtsCacheDir, 'build-'));
	const dtsConfig = join(dtsTempDir, 'tsconfig.json');
	// Cross-package `@mcp-vertex/*` types resolve to each dependency's BUILT
	// `dist/*.d.ts` (declaration inputs — not pulled into this package's
	// program, so no `rootDir` violation). Core is the only shared dependency;
	// it is built first. Core itself imports no sibling package.
	const corePaths =
		rel === 'packages/core'
			? {}
			: {
					'@mcp-vertex/core': [
						join(ROOT, 'packages/core/dist/index.d.ts'),
					],
					'@mcp-vertex/core/public': [
						join(ROOT, 'packages/core/dist/public/index.d.ts'),
					],
				};
	writeFileSync(
		dtsConfig,
		JSON.stringify(
			{
				extends: join(ROOT, 'tsconfig.base.json'),
				compilerOptions: {
					noEmit: false,
					declaration: true,
					emitDeclarationOnly: true,
					outDir: join(dir, 'dist'),
					rootDir: join(dir, 'src'),
					paths: corePaths,
				},
				include: [join(dir, 'src/**/*')],
				exclude: [
					join(dir, 'src/**/*.spec.ts'),
					join(dir, 'src/**/*.test.ts'),
				],
			},
			null,
			'\t',
		),
	);
	try {
		run('bunx', ['tsc', '-p', dtsConfig], dir);
	} finally {
		rmSync(dtsTempDir, { recursive: true, force: true });
	}
};

const targets =
	process.argv.slice(2).length > 0 ? process.argv.slice(2) : discover();
for (const rel of targets) buildPackage(rel);
console.log(`\n✓ Built ${targets.length} package(s).`);
