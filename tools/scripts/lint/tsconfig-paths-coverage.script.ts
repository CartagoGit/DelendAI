#!/usr/bin/env bun
/**
 * tsconfig-paths-coverage.script.ts
 *
 * Runtime plugin/package resolution silently depends on
 * `compilerOptions.paths` in `tsconfig.base.json`: Bun honours that
 * map, and it is what lets every workspace package resolve from
 * source in CI with no `dist/` and no build step (see
 * `packages/core/src/lib/plugins/load-plugins.ts#resolvePluginSpecifier`,
 * which expands a bare plugin name to `@delendai/<name>` and lets
 * the runtime resolver find it). A single missing or stale `paths`
 * entry does not fail loudly — the module falls through to its
 * `dist/`-based `exports` condition instead, which silently breaks
 * when `dist/` isn't built (exactly what happened to
 * `plugins/agent-orchestrator`, dropping 4 tools from every preset
 * with every other gate green).
 *
 * This gate derives the *actual* required shape from disk — it
 * never hardcodes a package list — and asserts three invariants:
 *
 *   1. COVERAGE — every workspace package whose `package.json`
 *      declares an `exports` field has a `paths` entry for its `.`
 *      export (mapped to the resolved source file for that export:
 *      the `@delendai/source` condition's `types` target if the
 *      package declares one, else the plain `types` target), a
 *      `paths` entry for its `./public` export *iff* the package
 *      declares one, and a `paths` wildcard entry
 *      (`@delendai/<name>/*` → `<dir>/src/*`) — the established,
 *      verified convention every such package follows today
 *      (`packages/core` additionally maps a few narrower aliases
 *      like `/version`; those are permitted extras, never required).
 *   2. ON-DISK — every `@delendai/*` `paths` target that exists in
 *      the map must resolve to a real file (or, for the wildcard
 *      entry, a real directory) on disk.
 *   3. NO ORPHANS — every `@delendai/<name>` `paths` key must name
 *      a package that still exists among the workspace packages
 *      discovered above (catches stale entries for renamed/removed
 *      packages).
 *
 * Usage:
 *   bun tools/scripts/lint/tsconfig-paths-coverage.script.ts
 *   bun tools/scripts/lint/tsconfig-paths-coverage.script.ts --root=/abs/path
 *
 * Exit codes:
 *   0 — clean
 *   1 — one or more violations
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildGraph } from '../ci/affected.script.ts';

const SCOPE_PREFIX = '@delendai/';

interface IExportConditionEntry {
	readonly types?: string;
}

interface IExportSubpathEntry {
	readonly types?: string;
	readonly import?: string;
	readonly '@delendai/source'?: IExportConditionEntry;
}

type ExportSubpathValue = string | IExportSubpathEntry;

interface IPackageJson {
	readonly name?: string;
	readonly exports?: Readonly<Record<string, ExportSubpathValue>>;
}

interface ITsconfigBase {
	readonly compilerOptions: {
		readonly paths: Readonly<Record<string, readonly string[]>>;
	};
}

export type TsconfigPathsViolationRule =
	| 'TSPATH-MISSING-001'
	| 'TSPATH-MISMATCH-001'
	| 'TSPATH-STALE-TARGET-001'
	| 'TSPATH-ORPHAN-001';

export interface ITsconfigPathsViolation {
	readonly rule: TsconfigPathsViolationRule;
	readonly key: string;
	readonly message: string;
}

interface IWorkspacePackage {
	/** Repo-root-relative directory, e.g. `plugins/agent-orchestrator`. */
	readonly dir: string;
	readonly name: string;
	readonly exports: Readonly<Record<string, ExportSubpathValue>>;
}

interface IRequiredEntry {
	readonly key: string;
	readonly expectedTarget: string;
	readonly diskCheck: 'file' | 'directory';
}

/**
 * Resolve the export condition value we want `paths` to point at:
 * the `@delendai/source` condition's `types` target when present
 * (packages that ship a built `dist/` and gate it behind that
 * condition), otherwise the subpath's plain `types` target (packages
 * whose `exports` always points straight at `src/`, e.g.
 * `ui-extension`, `shared`, `changelog`).
 */
const resolveExportTarget = (value: ExportSubpathValue): string | undefined => {
	if (typeof value === 'string') return value;
	const sourceTarget = value['@delendai/source']?.types;
	if (sourceTarget !== undefined) return sourceTarget;
	return value.types;
};

/** Join a package-relative export target onto its workspace dir, POSIX-normalised, always `./`-prefixed. */
const toRepoRelativeTarget = (dir: string, exportTarget: string): string => {
	const withoutDotSlash = exportTarget.startsWith('./')
		? exportTarget.slice(2)
		: exportTarget;
	return `./${dir}/${withoutDotSlash}`;
};

/**
 * Every workspace package whose `package.json` declares `exports`
 * needs `paths` coverage — that field is exactly the signal that a
 * package is meant to be resolved by bare specifier (as opposed to
 * `apps/web`, `tools`, `tools/docs-api`, and the doc examples, none
 * of which declare `exports` and are never dynamically imported).
 */
const discoverWorkspacePackages = async (
	rootDir: string,
): Promise<readonly IWorkspacePackage[]> => {
	const graph = buildGraph(rootDir);
	const packages: IWorkspacePackage[] = [];
	for (const [dir, name] of graph.dirToName) {
		const pkgPath = join(rootDir, dir, 'package.json');
		const raw = await readFile(pkgPath, 'utf8');
		const pkg = JSON.parse(raw) as IPackageJson;
		if (pkg.exports === undefined) continue;
		packages.push({ dir, name, exports: pkg.exports });
	}
	return packages;
};

/** The required `paths` entries for one package, per the invariant documented above. */
const requiredEntriesFor = (
	pkg: IWorkspacePackage,
): readonly IRequiredEntry[] => {
	const entries: IRequiredEntry[] = [];
	const mainExport = pkg.exports['.'];
	if (mainExport !== undefined) {
		const target = resolveExportTarget(mainExport);
		if (target !== undefined) {
			entries.push({
				key: pkg.name,
				expectedTarget: toRepoRelativeTarget(pkg.dir, target),
				diskCheck: 'file',
			});
		}
	}
	const publicExport = pkg.exports['./public'];
	if (publicExport !== undefined) {
		const target = resolveExportTarget(publicExport);
		if (target !== undefined) {
			entries.push({
				key: `${pkg.name}/public`,
				expectedTarget: toRepoRelativeTarget(pkg.dir, target),
				diskCheck: 'file',
			});
		}
	}
	entries.push({
		key: `${pkg.name}/*`,
		expectedTarget: `./${pkg.dir}/src/*`,
		diskCheck: 'directory',
	});
	return entries;
};

const diskTargetExists = (
	rootDir: string,
	expectedTarget: string,
	diskCheck: 'file' | 'directory',
): boolean => {
	const withoutWildcard = expectedTarget.endsWith('/*')
		? expectedTarget.slice(0, -2)
		: expectedTarget;
	const abs = join(rootDir, withoutWildcard);
	if (!existsSync(abs)) return false;
	const stat = statSync(abs);
	return diskCheck === 'directory' ? stat.isDirectory() : stat.isFile();
};

/** Strip an optional subpath suffix (`/public`, `/*`, `/version`, ...) down to the scoped package name. */
const packageNameFromPathsKey = (key: string): string => {
	const parts = key.split('/');
	return parts.slice(0, 2).join('/');
};

const arraysEqual = (
	a: readonly string[] | undefined,
	b: readonly string[] | undefined,
): boolean => {
	if (a === undefined || b === undefined) return false;
	if (a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
};

/**
 * `@delendai/ide` is a deliberate, documented backward-compatible
 * alias for `@delendai/ui-extension` (see
 * `packages/ui-extension/src/index.ts`'s module doc and
 * `vitest.shared.ts`'s matching resolve alias) — its package name
 * doesn't exist on disk, but its `paths` targets are identical to a
 * real package's. Recognise that shape structurally instead of
 * hardcoding "ide": a `paths` key group counts as a legitimate alias
 * — not an orphan — when its main-export target matches some real
 * package's main-export target exactly (and any `/public` or `/*`
 * targets it also declares match that same package's).
 */
const isRecognizedAlias = (
	candidateName: string,
	actualPaths: Readonly<Record<string, readonly string[]>>,
	knownPackageNames: ReadonlySet<string>,
): boolean => {
	const candidateMain = actualPaths[candidateName];
	const candidatePublic = actualPaths[`${candidateName}/public`];
	const candidateWildcard = actualPaths[`${candidateName}/*`];
	if (candidateMain === undefined) return false;
	for (const knownName of knownPackageNames) {
		const knownMain = actualPaths[knownName];
		if (!arraysEqual(candidateMain, knownMain)) continue;
		const publicOk =
			candidatePublic === undefined ||
			arraysEqual(candidatePublic, actualPaths[`${knownName}/public`]);
		const wildcardOk =
			candidateWildcard === undefined ||
			arraysEqual(candidateWildcard, actualPaths[`${knownName}/*`]);
		if (publicOk && wildcardOk) return true;
	}
	return false;
};

export const lintTsconfigPathsCoverage = async (
	rootDir: string,
): Promise<readonly ITsconfigPathsViolation[]> => {
	const violations: ITsconfigPathsViolation[] = [];
	const packages = await discoverWorkspacePackages(rootDir);
	const knownPackageNames = new Set(packages.map((pkg) => pkg.name));

	const tsconfigPath = join(rootDir, 'tsconfig.base.json');
	const tsconfig = JSON.parse(
		await readFile(tsconfigPath, 'utf8'),
	) as ITsconfigBase;
	const actualPaths = tsconfig.compilerOptions.paths;

	for (const pkg of packages) {
		for (const required of requiredEntriesFor(pkg)) {
			const actual = actualPaths[required.key];
			if (actual === undefined) {
				violations.push({
					rule: 'TSPATH-MISSING-001',
					key: required.key,
					message: `tsconfig.base.json#compilerOptions.paths is missing "${required.key}" (expected [${JSON.stringify(required.expectedTarget)}]). Without it, ${pkg.name} silently falls back to its dist/ exports condition and breaks with no dist/ built.`,
				});
				continue;
			}
			const matches =
				actual.length === 1 && actual[0] === required.expectedTarget;
			if (!matches) {
				violations.push({
					rule: 'TSPATH-MISMATCH-001',
					key: required.key,
					message: `tsconfig.base.json#compilerOptions.paths["${required.key}"] is ${JSON.stringify(actual)}, expected exactly [${JSON.stringify(required.expectedTarget)}].`,
				});
			}
		}
	}

	for (const [key, targets] of Object.entries(actualPaths)) {
		if (!key.startsWith(SCOPE_PREFIX)) continue;
		const packageName = packageNameFromPathsKey(key);
		if (
			!knownPackageNames.has(packageName) &&
			!isRecognizedAlias(packageName, actualPaths, knownPackageNames)
		) {
			violations.push({
				rule: 'TSPATH-ORPHAN-001',
				key,
				message: `tsconfig.base.json#compilerOptions.paths["${key}"] references package "${packageName}", which no longer exists as a workspace package with an "exports" field (and isn't a recognised alias of one). Remove the stale entry.`,
			});
			continue;
		}
		const diskCheck: 'file' | 'directory' = key.endsWith('/*')
			? 'directory'
			: 'file';
		for (const target of targets) {
			if (!diskTargetExists(rootDir, target, diskCheck)) {
				violations.push({
					rule: 'TSPATH-STALE-TARGET-001',
					key,
					message: `tsconfig.base.json#compilerOptions.paths["${key}"] points at "${target}", which does not exist on disk (expected a ${diskCheck}).`,
				});
			}
		}
	}

	violations.sort(
		(a, b) => a.key.localeCompare(b.key) || a.rule.localeCompare(b.rule),
	);
	return violations;
};

const formatReport = (
	violations: readonly ITsconfigPathsViolation[],
): string => {
	if (violations.length === 0) {
		return '[tsconfig-paths-coverage] OK.\n';
	}
	const lines = [
		`[tsconfig-paths-coverage] ${violations.length} violation${violations.length === 1 ? '' : 's'} in tsconfig.base.json#compilerOptions.paths:`,
	];
	for (const violation of violations) {
		lines.push(`  [${violation.rule}] ${violation.message}`);
	}
	return `${lines.join('\n')}\n`;
};

const parseArgs = (argv: readonly string[]): { readonly rootDir: string } => {
	let rootDir = process.cwd();
	for (const arg of argv) {
		if (arg.startsWith('--root=')) {
			rootDir = arg.slice('--root='.length);
		}
	}
	return { rootDir };
};

export const main = async (argv = process.argv.slice(2)): Promise<number> => {
	const { rootDir } = parseArgs(argv);
	const violations = await lintTsconfigPathsCoverage(rootDir);
	const text = formatReport(violations);
	if (violations.length === 0) {
		process.stdout.write(text);
		return 0;
	}
	process.stderr.write(text);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
