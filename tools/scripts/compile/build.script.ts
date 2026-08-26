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
	readFileSync,
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

class BuildError extends Error {
	constructor(
		message: string,
		readonly exitCode: number,
	) {
		super(message);
		this.name = 'BuildError';
	}
}

/**
 * Run a child command and forward stdio. Throws `BuildError` on a
 * non-zero exit so the caller's `try/finally` blocks actually run.
 * The previous version called `process.exit()` directly, which
 * bypassed every `finally` and leaked `mkdtempSync` dirs under
 * `node_modules/.cache/mcp-vertex-dts/build-*` for every failed
 * package build (CI runs would accumulate one leaked dir per failure).
 */
const run = (cmd: string, args: string[], cwd: string): void => {
	const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
	if (r.status !== 0) {
		console.error(`\n✗ ${cmd} ${args.join(' ')} (in ${cwd}) failed`);
		throw new BuildError(
			`build command failed: ${cmd} ${args.join(' ')}`,
			r.status ?? 1,
		);
	}
};

const buildPackage = (rel: string): void => {
	const dir = join(ROOT, rel);
	const entries = ['src/index.ts'];
	if (existsSync(join(dir, 'src/public/index.ts')))
		entries.push('src/public/index.ts');
	if (existsSync(join(dir, 'src/cli.ts'))) entries.push('src/cli.ts');
	// Keep every declared core subpath runnable after packaging. The
	// declaration pass already emits these files, but omitting their JS
	// entrypoints leaves `@mcp-vertex/core/{contracts,runtime,plugin,node}`
	// resolvable in TypeScript and broken at runtime.
	if (rel === 'packages/core') {
		for (const subpath of ['contracts', 'runtime', 'plugin', 'node']) {
			if (existsSync(join(dir, 'src', subpath, 'index.ts')))
				entries.push(`src/${subpath}/index.ts`);
		}
		if (existsSync(join(dir, 'src/version.ts')))
			entries.push('src/version.ts');
	}

	// ESM-only entrypoints (packages whose package.json has a `bin` block)
	// must be built with `--target bun` — `--target node` rewrites the
	// source's `import.meta.main` entrypoint check into a CJS shim
	// (`if (__require.main == __require.module)`), and that shim is
	// undefined when bun loads the bundle as ESM (type: "module").
	// Library packages (no `bin`) keep `--target node` so they remain
	// portable across Node/Deno/bun.
	const pkgJsonPath = join(dir, 'package.json');
	const hasBin = existsSync(pkgJsonPath)
		? (JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { bin?: unknown })
				.bin !== undefined
		: false;
	const target = hasBin ? 'bun' : 'node';

	console.log(
		`\n• ${rel} → dist (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, target=${target}${hasBin ? ', bin detected' : ''})`,
	);
	rmSync(join(dir, 'dist'), { recursive: true, force: true });

	// 1. JS bundles (deps external; bundler-style imports resolved here).
	//    a00065: routed through `bundle-js.ts` (a `Bun.build()` wrapper)
	//    instead of the `bun build` CLI so the repo's `scssPlugin` is
	//    applied — the CLI does not load plugins, and Bun ≥1.3.x now
	//    treats a bare `.scss` import as native CSS, which broke
	//    `packages/ui-extension` (its `import { compiledCss }`) and with
	//    it `bun run build` + the whole release/pack path.
	run(
		'bun',
		[
			join(ROOT, 'tools/scripts/compile/bundle-js.ts'),
			'--cwd',
			dir,
			'--target',
			target,
			'--root',
			'src',
			'--outdir',
			'dist',
			...entries.flatMap((e) => ['--entry', e]),
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
	// program, so no `rootDir` violation). Build order guarantees the
	// dependency's dist exists: rank 0 first (core), then rank 1 (other
	// packages), then rank 2 (plugins) in alphabetical order.
	const builtDepPaths = (pkg: string): Record<string, string[]> => ({
		[`@mcp-vertex/${pkg}`]: [join(ROOT, `packages/${pkg}/dist/index.d.ts`)],
		[`@mcp-vertex/${pkg}/public`]: [
			join(ROOT, `packages/${pkg}/dist/public/index.d.ts`),
		],
		// Deep imports (e.g. apps/shared → @mcp-vertex/client/lib/contracts/…)
		// resolve file-by-file against the built declarations.
		[`@mcp-vertex/${pkg}/lib/*`]: [
			join(ROOT, `packages/${pkg}/dist/lib/*`),
		],
	});
	const builtPluginPaths = (plugin: string): Record<string, string[]> => ({
		[`@mcp-vertex/${plugin}`]: [
			join(ROOT, `plugins/${plugin}/dist/index.d.ts`),
		],
		[`@mcp-vertex/${plugin}/public`]: [
			join(ROOT, `plugins/${plugin}/dist/public/index.d.ts`),
		],
		[`@mcp-vertex/${plugin}/lib/*`]: [
			join(ROOT, `plugins/${plugin}/dist/lib/*`),
		],
	});
	// Introspect package.json so plugin-to-plugin deep imports (e.g.
	// auto-plugin-selector → auto-agent-selector/lib/ranking/*) resolve to
	// the BUILT .d.ts files of the dependency plugin. Build order guarantees
	// the dependency's dist exists: discover() sorts alphabetically within
	// rank 2 (plugins), so e.g. `auto-agent-selector` builds before
	// `auto-plugin-selector`.
	const pkgMeta: {
		name?: string;
		dependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	} = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
	const mcpDeps = new Set<string>();
	for (const section of ['dependencies', 'peerDependencies'] as const) {
		const map = pkgMeta[section] ?? {};
		for (const dep of Object.keys(map)) {
			if (dep.startsWith('@mcp-vertex/')) {
				mcpDeps.add(dep.replace(/^@mcp-vertex\//, ''));
			}
		}
	}
	const selfName = pkgMeta.name?.replace(/^@mcp-vertex\//, '');
	if (selfName) mcpDeps.delete(selfName);
	const corePaths: Record<string, string[]> = {};
	for (const dep of mcpDeps) {
		const pkgPath = join(ROOT, 'packages', dep);
		const pluginPath = join(ROOT, 'plugins', dep);
		if (existsSync(pkgPath) && rel !== `packages/${dep}`) {
			Object.assign(corePaths, builtDepPaths(dep));
		} else if (existsSync(pluginPath) && rel !== `plugins/${dep}`) {
			Object.assign(corePaths, builtPluginPaths(dep));
		}
	}
	// apps/shared (compiled into the ui-extension dts program) imports
	// @mcp-vertex/client deep paths; client's dist is built before
	// ui-extension (alphabetical within rank 1).
	// This block is now redundant (the dep introspection above picks up
	// client), kept for clarity that ui-extension's dist must exist before
	// building it.
	// All work that touches the throwaway `dtsTempDir` lives inside the
	// try/finally so a failure in `writeFileSync`, `JSON.stringify`, or
	// `run` cleans up the tempdir. `run` throws `BuildError` instead of
	// calling `process.exit`, so the finally actually runs.
	try {
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
					include: [
						join(dir, 'src/**/*'),
						// Ambient `*.scss` module declarations for the shared
						// package's style .ts modules (dev-preview-css & co.).
						// A dependency's ambient d.ts is not auto-loaded, and
						// it emits nothing, so including it here is safe for
						// every package.
						join(ROOT, 'apps/shared/src/styles/raw.d.ts'),
					],
					exclude: [
						join(dir, 'src/**/*.spec.ts'),
						join(dir, 'src/**/*.test.ts'),
					],
				},
				null,
				'\t',
			),
		);
		run('bunx', ['tsc', '-p', dtsConfig], dir);
	} finally {
		rmSync(dtsTempDir, { recursive: true, force: true });
	}
};

const targets =
	process.argv.slice(2).length > 0 ? process.argv.slice(2) : discover();
let firstFailure: BuildError | undefined;
for (const rel of targets) {
	try {
		buildPackage(rel);
	} catch (err) {
		if (err instanceof BuildError) {
			if (firstFailure === undefined) firstFailure = err;
			// Continue so the remaining packages still build (their own
			// try/finally cleanups still run); we surface the failure
			// at the end so partial progress is visible to the operator.
		} else {
			throw err;
		}
	}
}
if (firstFailure !== undefined) {
	console.error(
		`\n✗ Build failed; first failure exit code ${firstFailure.exitCode}.`,
	);
	process.exit(firstFailure.exitCode);
}
console.log(`\n✓ Built ${targets.length} package(s).`);
