#!/usr/bin/env bun
/**
 * Build driver (M3 — publishable runtime).
 *
 * r00045 S1: every artefact lives under one canonical tree:
 *
 *     build/{group}/{name}/{version}/
 *
 * where {group} ∈ {packages, plugins}, {name} is the workspace folder,
 * and {version} is read from the package's own package.json. The old
 * per-package `dist/` is gone; per-package `package.json#main`/`#exports`
 * now point into `build/{group}/{name}/{version}/`.
 *
 * - `.js`  bundled with `bun build` (ESM, target node, deps kept external),
 *          so it runs under Node/npm/pnpm/yarn, Deno and bun alike. The
 *          bundler resolves the project's extensionless ("bundler"
 *          moduleResolution) imports that Node ESM could not.
 * - `.d.ts` emitted by `tsc --emitDeclarationOnly` (cross-package types
 *          resolve via the base `paths`).
 *
 * Dev/tests keep using `src` directly via the vitest aliases — this build is
 * only for what ends up on the registry.
 *
 * Usage: `bun run build` (root) or `bun scripts/build.ts [pkgDir ...]`.
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Walk up from this file's directory until we find a directory that
// contains `delendai.config.json` (or `.git`). That is the repo root.
// This is robust against future moves of the script under
// tools/scripts/<area>/<...>.<depth>.script.ts — the ROOT computation
// doesn't break if the file is relocated one or more directories deeper.
const findRepoRoot = (start: string): string => {
	let current = start;
	for (let i = 0; i < 8; i++) {
		if (
			existsSync(join(current, 'delendai.config.json')) ||
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

export const resolveWorkspaceBinary = (
	binaryName: string,
	root = ROOT,
): string =>
	join(
		root,
		'node_modules',
		'.bin',
		process.platform === 'win32' ? `${binaryName}.cmd` : binaryName,
	);

export const createDtsTempDir = (): string =>
	mkdtempSync(join(tmpdir(), 'delendai-dts-'));

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
 * `node_modules/.cache/delendai-dts/build-*` for every failed
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
	const pkgJsonPath = join(dir, 'package.json');
	const pkgMeta: {
		name?: string;
		version?: string;
		bin?: unknown;
		dependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	} = existsSync(pkgJsonPath)
		? (JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
				name?: string;
				version?: string;
				bin?: unknown;
				dependencies?: Record<string, string>;
				peerDependencies?: Record<string, string>;
			})
		: {};
	if (!pkgMeta.version) {
		throw new BuildError(
			`build: ${rel}/package.json does not declare a version; cannot compute build/<group>/<name>/<version>/ output dir`,
			1,
		);
	}

	// r00045 S1: emit under build/{group}/{name}/{version}/ instead of
	// per-package dist/. The version comes from package.json so it stays
	// in sync with `npm publish` and the `package.json#exports` paths.
	const group = rel.startsWith('packages/') ? 'packages' : 'plugins';
	const name = rel.split('/').slice(1).join('/');
	const outRoot = join(ROOT, 'build', group, name, pkgMeta.version);

	const workspaceTsc = resolveWorkspaceBinary('tsc');
	const entries = ['src/index.ts'];
	if (existsSync(join(dir, 'src/public/index.ts')))
		entries.push('src/public/index.ts');
	if (existsSync(join(dir, 'src/cli.ts'))) entries.push('src/cli.ts');
	// Keep every declared core subpath runnable after packaging. The
	// declaration pass already emits these files, but omitting their JS
	// entrypoints leaves `@delendai/core/{contracts,runtime,plugin,node}`
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
	const hasBin = pkgMeta.bin !== undefined;
	const target = hasBin ? 'bun' : 'node';

	console.log(
		`\n• ${rel} → build/${group}/${name}/${pkgMeta.version} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, target=${target}${hasBin ? ', bin detected' : ''})`,
	);
	// Idempotency: wipe the entire version-dir so a re-run doesn't leave
	// stale files from a previous version when version bumped.
	rmSync(outRoot, { recursive: true, force: true });

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
			outRoot,
			...entries.flatMap((e) => ['--entry', e]),
		],
		dir,
	);

	// 2. Type declarations. A throwaway project inherits the base `paths` so
	//    cross-package `@delendai/*` types resolve from source.
	if (!existsSync(workspaceTsc)) {
		throw new Error(
			`Missing workspace TypeScript binary at ${workspaceTsc}; run bun install first.`,
		);
	}
	const dtsTempDir = createDtsTempDir();
	const dtsConfig = join(dtsTempDir, 'tsconfig.json');
	// Cross-package `@delendai/*` types resolve to each dependency's BUILT
	// declaration tree (declaration inputs — not pulled into this package's
	// program, so no `rootDir` violation). Each dependency can have a
	// different version, so read its own package.json instead of reusing the
	// current package's version.
	const dependencyVersion = (group: string, name: string): string => {
		const dependencyPackageJson = join(ROOT, group, name, 'package.json');
		const dependencyMeta = JSON.parse(
			readFileSync(dependencyPackageJson, 'utf8'),
		) as { version?: unknown };
		if (typeof dependencyMeta.version !== 'string') {
			throw new BuildError(
				`build: ${dependencyPackageJson} does not declare a string version`,
				1,
			);
		}
		return dependencyMeta.version;
	};
	// Path mappings are derived from each dependency's OWN
	// `package.json#exports`, not a hardcoded ['.', './public'] guess —
	// a dependency (e.g. `@delendai/core`) can declare arbitrarily many
	// subpaths (`./contracts`, `./runtime`, `./plugin`, `./node`, `./cli`,
	// `./version`, `./manifest`, …), and a consumer that only imports one
	// of them (e.g. `@delendai/client` re-exporting `@delendai/core/
	// contracts`) still needs it mapped. Each export condition's own
	// `@delendai/source` `types` path (e.g. "./src/contracts/index.ts")
	// already names the real source file, so the built `.d.ts` location is
	// derived from that instead of re-deriving it from the subpath name —
	// subpaths like `./cli` (→ `src/cli.ts`, not `src/cli/index.ts`) and
	// `./manifest` (→ the SAME source file as `./public`) don't follow the
	// `<subpath>/index.ts` shape the old hardcoded mapping assumed.
	const builtDepPaths = (
		group: 'packages' | 'plugins',
		pkg: string,
	): Record<string, string[]> => {
		const version = dependencyVersion(group, pkg);
		const outRoot = join(ROOT, `build/${group}/${pkg}/${version}`);
		const depPkgJsonPath = join(ROOT, group, pkg, 'package.json');
		const depMeta = JSON.parse(readFileSync(depPkgJsonPath, 'utf8')) as {
			exports?: Record<
				string,
				{ '@delendai/source'?: { types?: string } }
			>;
		};
		const paths: Record<string, string[]> = {};
		for (const [subpath, condition] of Object.entries(
			depMeta.exports ?? {},
		)) {
			const sourceTypes = condition?.['@delendai/source']?.types;
			if (typeof sourceTypes !== 'string') continue;
			// "./src/contracts/index.ts" -> "contracts/index.d.ts"
			const relDts = sourceTypes
				.replace(/^\.\/src\//, '')
				.replace(/\.ts$/, '.d.ts');
			const specifier =
				subpath === '.'
					? `@delendai/${pkg}`
					: `@delendai/${pkg}/${subpath.slice(2)}`;
			paths[specifier] = [join(outRoot, relDts)];
		}
		// Deep imports (e.g. apps/shared → @delendai/client/lib/contracts/…)
		// resolve file-by-file against the built declarations — these are
		// not declared subpaths in `exports`, so they're added separately.
		paths[`@delendai/${pkg}/lib/*`] = [join(outRoot, 'lib/*')];
		return paths;
	};
	// Introspect package.json so cross-package deep imports (e.g.
	// auto-plugin-selector → auto-agent-selector/lib/ranking/*, or
	// ui-extension → client → core/contracts) resolve to the BUILT `.d.ts`
	// files of the dependency. This walks the TRANSITIVE `@delendai/*`
	// dependency graph, not just direct dependencies: a re-exported type
	// from a dependency-of-a-dependency (client re-exporting
	// `@delendai/core/contracts` to ui-extension, which never depends on
	// core directly) needs the same mapping a direct dependency would get,
	// or resolution falls through to `node_modules` — where bun's
	// per-package (non-hoisted) linking only puts `@delendai/core` inside
	// packages that declare it directly, not inside every transitive
	// consumer. Build order guarantees each dependency's dist exists:
	// `packages/core` is always rank 0, and `discover()` otherwise sorts
	// alphabetically within each rank, so e.g. `auto-agent-selector` builds
	// before `auto-plugin-selector`.
	const selfName = pkgMeta.name?.replace(/^@delendai\//, '');
	const mcpDeps = new Set<string>(); // "packages/x" | "plugins/x", transitive
	const queue: string[] = [rel];
	while (queue.length > 0) {
		const currentRel = queue.shift()!;
		const currentPkgJsonPath = join(ROOT, currentRel, 'package.json');
		if (!existsSync(currentPkgJsonPath)) continue;
		const currentMeta = JSON.parse(
			readFileSync(currentPkgJsonPath, 'utf8'),
		) as {
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		for (const section of ['dependencies', 'peerDependencies'] as const) {
			const map = currentMeta[section] ?? {};
			for (const dep of Object.keys(map)) {
				if (!dep.startsWith('@delendai/')) continue;
				const depName = dep.replace(/^@delendai\//, '');
				if (depName === selfName) continue;
				const depPkgRel = `packages/${depName}`;
				const depPluginRel = `plugins/${depName}`;
				const depRel = existsSync(join(ROOT, depPkgRel, 'package.json'))
					? depPkgRel
					: existsSync(join(ROOT, depPluginRel, 'package.json'))
						? depPluginRel
						: undefined;
				if (depRel === undefined || depRel === rel) continue;
				if (!mcpDeps.has(depRel)) {
					mcpDeps.add(depRel);
					queue.push(depRel);
				}
			}
		}
	}
	const corePaths: Record<string, string[]> = {};
	for (const depRel of mcpDeps) {
		const [group, name] = depRel.split('/') as [
			'packages' | 'plugins',
			string,
		];
		Object.assign(corePaths, builtDepPaths(group, name));
	}
	// apps/shared (compiled into the ui-extension dts program) imports
	// @delendai/client deep paths; client's build is produced before
	// ui-extension (alphabetical within rank 1). This block is now
	// redundant (the dep introspection above picks up client), kept for
	// clarity that ui-extension's build dir must exist before building it.
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
						outDir: outRoot,
						rootDir: join(dir, 'src'),
						// The throwaway tsconfig lives in /tmp; without an
						// explicit typeRoots tsc searches /tmp/node_modules/@types
						// and never finds @types/bun or @types/node. Point at the
						// workspace node_modules so `types: ["bun", "node"]`
						// (inherited from tsconfig.base.json) resolves.
						typeRoots: [join(ROOT, 'node_modules/@types')],
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
		run(workspaceTsc, ['-p', dtsConfig], dir);
	} finally {
		rmSync(dtsTempDir, { recursive: true, force: true });
	}

	// Mirror the canonical tree into the package's own `dist/`.
	//
	// r00045 made `build/{group}/{name}/{version}/` the single build
	// output — correct — but every one of the 62 manifests still declares
	// `"main": "./dist/index.js"`, and Node/npm do not allow `exports` to
	// escape the package directory with `../build` (r00045's own design
	// note says so). Nothing repointed them, so the moment the last stale
	// `dist/` was cleaned up, EVERY by-package-name import broke:
	// `Failed to resolve entry for package "@delendai/agent-orchestrator"`.
	//
	// The mirror is a copy, not a second build: `build/` stays the thing
	// that gets built and the thing CI cleans, and `dist/` is the
	// gitignored view of it that the declared entrypoints resolve to.
	mirrorBuildIntoPackageDist(outRoot, join(dir, 'dist'));
};

/**
 * Copy the canonical build output into the package's declared `dist/`.
 *
 * Content-aware on purpose. The previous implementation was `rmSync` +
 * `cpSync`, which rewrote all 62 mirrors on every build even when not one
 * byte had changed. That falsified this proposal's own idempotency
 * criterion — a rerun with no source changes produced identical bytes and
 * a new mtime on every file — and it made every build look, to any watcher
 * or incremental tool downstream, like the entire workspace had changed.
 *
 * The guarantee that mattered is kept and is the reason this walks the
 * tree rather than diffing at the top: a file that no longer exists in the
 * build output is REMOVED from the mirror, so a deleted entrypoint cannot
 * survive as a stale file that makes a broken package look resolvable.
 */
const mirrorBuildIntoPackageDist = (outRoot: string, distDir: string): void => {
	if (!existsSync(outRoot)) return;
	syncDirectory(outRoot, distDir);
};

/** Mirror `srcDir` onto `dstDir`, touching only what actually differs. */
const syncDirectory = (srcDir: string, dstDir: string): void => {
	mkdirSync(dstDir, { recursive: true });
	const entries = readdirSync(srcDir, { withFileTypes: true });
	const expected = new Set(entries.map((entry) => entry.name));
	for (const name of readdirSync(dstDir)) {
		if (expected.has(name)) continue;
		rmSync(join(dstDir, name), { recursive: true, force: true });
	}
	for (const entry of entries) {
		const from = join(srcDir, entry.name);
		const to = join(dstDir, entry.name);
		if (entry.isDirectory()) {
			syncDirectory(from, to);
			continue;
		}
		const next = readFileSync(from);
		if (existsSync(to) && readFileSync(to).equals(next)) continue;
		writeFileSync(to, next);
	}
};

export const main = (argv: string[]): number => {
	const targets = argv.length > 0 ? argv : discover();
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
		return firstFailure.exitCode;
	}
	console.log(`\n✓ Built ${targets.length} package(s).`);
	return 0;
};

if (import.meta.main) {
	process.exit(main(process.argv.slice(2)));
}
