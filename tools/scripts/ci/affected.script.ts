#!/usr/bin/env bun
/**
 * affected.script.ts — c00138 (Track G, audit §30, §49).
 *
 * Computes the **transitive closure of affected workspaces** for a
 * git range (PR base → head, push before → sha, or `--all`). The
 * downstream tier workflows (c00139) consume the JSON / newline
 * file this script emits and skip jobs for packages that didn't
 * change.
 *
 * Why this lives here
 * -------------------
 * The existing CI workflow (`.github/workflows/ci.yml`) runs the
 * full matrix on every push; the audit flagged this as both a
 * waste of CI minutes and a source of false positives (a plugin
 * PR shows unrelated failures). The fix is to filter at the job
 * matrix level using a JSON file the workflow emits before the
 * jobs run.
 *
 * How the graph is built
 * ----------------------
 * 1. Read the root `package.json#workspaces` glob list.
 * 2. For each workspace, read its `package.json#dependencies` and
 *    `#peerDependencies`. Filter to entries whose specifier is
 *    `workspace:*` (the bun/npm convention for in-monorepo deps).
 * 3. Resolve each specifier to the leaf workspace name.
 *
 * Mapping files → workspaces
 * --------------------------
 * A file is mapped to its top-level workspace by prefix match
 * (`packages/foo/...` → `@delendai/foo`). Files outside any
 * workspace are bucketed into a virtual `root` workspace so they
 * still trigger the conservative full-matrix run.
 *
 * Closure semantics
 * -----------------
 * - **downstream** (the package's dependents) — if I change
 *   `@delendai/core`, every plugin that imports it must
 *   re-test.
 * - **upstream** (the package's dependencies) — if I change a
 *   plugin that depends on `@delendai/logs`, then logs' tests
 *   must re-run too because the plugin's contract changed.
 *
 * Inputs (CLI flags):
 *
 *   --base <ref>       REQUIRED unless --all. The base ref to
 *                       diff against (PR base SHA, push before-SHA).
 *   --head <ref>       OPTIONAL. Defaults to HEAD.
 *   --output <path>    OPTIONAL. Path to write the JSON report.
 *                       Defaults to `build/ci/affected.json`.
 *   --set-file <path>  OPTIONAL. Path to write the newline-joined
 *                       workspace names (consumed by tier1.yml).
 *                       Defaults to `<output dir>/.affected-set`.
 *   --all              OPTIONAL. Skip git, mark every workspace
 *                       as affected (nightly mode).
 *
 * Exit codes:
 *   0  affected set computed + written.
 *   1  unexpected git / I/O failure.
 *   2  invalid CLI usage.
 */

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface IPackageGraph {
	readonly rootDir: string;
	/** Workspace directory → workspace name (e.g. `packages/core` → `@delendai/core`). */
	readonly dirToName: ReadonlyMap<string, string>;
	/** Workspace name → its declared workspace dependencies. */
	readonly nameToDeps: ReadonlyMap<string, readonly string[]>;
	/** Reverse edge map: name → workspaces that depend on it. */
	readonly nameToDependents: ReadonlyMap<string, readonly string[]>;
	/** All known workspace names. */
	readonly workspaces: readonly string[];
}

export interface IAffectedResult {
	readonly mode: 'diff' | 'all';
	readonly base: string | null;
	readonly head: string | null;
	/** Files that fall outside any workspace (root-level config, etc.). */
	readonly rootFiles: readonly string[];
	/** Files mapped to a workspace, grouped by workspace name. */
	readonly directByWorkspace: ReadonlyMap<string, readonly string[]>;
	/** Direct + transitive closure of affected workspaces. */
	readonly affected: readonly string[];
	/** Resolved Vitest project names for the affected set, in workspace order. */
	readonly vitestProjects: readonly string[];
	/** Upstream (dependencies of the affected set). */
	readonly upstream: readonly string[];
	/** Downstream (dependents of the affected set). */
	readonly downstream: readonly string[];
}

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

/**
 * Read a JSON file as `unknown`. Surfaces a path-qualified error so
 * CI logs are self-explanatory when the format drifts.
 */
const readJSON = (path: string): unknown => {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as unknown;
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`Could not parse ${path}: ${reason}`);
	}
};

/**
 * Normalise the `package.json#workspaces` glob list to an array of
 * concrete directory paths. The workspaces field can be either a
 * glob string (`"packages/*"`) or an array of glob strings.
 */
const expandWorkspaces = (
	rootDir: string,
	patterns: readonly string[],
): readonly string[] => {
	const dirs: string[] = [];
	for (const pattern of patterns) {
		const expanded = expandGlob(rootDir, pattern);
		for (const dir of expanded) {
			if (!dirs.includes(dir)) dirs.push(dir);
		}
	}
	return dirs.sort();
};

/**
 * Minimal glob expander for the patterns used by this monorepo
 * (`packages/*`, `plugins/*`, `apps/*`, `extensions/*`,
 * `docs/delendai/examples/*`, `tools`, `tools/docs-api`). Any
 * pattern we don't recognise falls through as a literal directory
 * so the workspace list never silently shrinks.
 *
 * Recognised shapes:
 *   - `<group>/*`             — every immediate child directory of `<group>`.
 *   - `<group>/<group>/*`     — multi-level wildcard (e.g.
 *                                `docs/delendai/examples/*`).
 *   - `<literal>`             — single literal directory.
 */
const expandGlob = (rootDir: string, pattern: string): readonly string[] => {
	const parts = pattern.split('/');
	const wildcardIndex = parts.indexOf('*');
	if (wildcardIndex !== -1) {
		const parentParts = parts.slice(0, wildcardIndex);
		const parentRel = parentParts.join('/');
		const parentAbs = join(rootDir, parentRel);
		if (!existsSync(parentAbs)) return [];
		const children = readdirSync(parentAbs, { withFileTypes: true });
		return children
			.filter((c) => c.isDirectory())
			.map((c) => `${parentRel}/${c.name}`)
			.sort();
	}
	// Literal path (e.g. `tools`, `tools/docs-api`).
	return [pattern];
};

const vitestConfigNames = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.config.mjs',
] as const;

export const resolveVitestProjectName = (
	dir: string,
	pkgName: string,
): string => {
	for (const configName of vitestConfigNames) {
		const configPath = join(dir, configName);
		if (!existsSync(configPath)) continue;
		const source = readFileSync(configPath, 'utf8');
		const testNameMatch =
			/test\s*:\s*\{[\s\S]*?\bname\s*:\s*(['"])([^'"\n]+)\1/.exec(source);
		if (testNameMatch?.[2] !== undefined) return testNameMatch[2];

		const fallbackMatch = /\bname\s*:\s*(['"])([^'"\n]+)\1/.exec(source);
		if (fallbackMatch?.[2] !== undefined) return fallbackMatch[2];
	}

	return pkgName;
};

const resolveAffectedVitestProjects = (
	graph: IPackageGraph,
	affected: readonly string[],
): readonly string[] => {
	const nameToDir = new Map<string, string>();
	for (const [dir, name] of graph.dirToName) {
		nameToDir.set(name, dir);
	}

	return affected.map((workspaceName) => {
		const workspaceDir = nameToDir.get(workspaceName);
		if (workspaceDir === undefined) return workspaceName;
		return resolveVitestProjectName(
			join(graph.rootDir, workspaceDir),
			workspaceName,
		);
	});
};

/**
 * Read the workspace graph from the root `package.json`. Walks
 * every workspace's `package.json` and extracts `workspace:*`
 * dependencies, resolving them by directory adjacency.
 */
export const buildGraph = (rootDir: string): IPackageGraph => {
	const rootPkg = readJSON(join(rootDir, 'package.json')) as {
		workspaces?: string | readonly string[];
	};
	const patterns: readonly string[] = Array.isArray(rootPkg.workspaces)
		? rootPkg.workspaces
		: typeof rootPkg.workspaces === 'string'
			? [rootPkg.workspaces]
			: [];

	const dirs = expandWorkspaces(rootDir, patterns);
	const dirToName = new Map<string, string>();
	const nameToDeps = new Map<string, readonly string[]>();
	const nameToDependents = new Map<string, string[]>();
	const workspaces: string[] = [];

	for (const dir of dirs) {
		const pkgPath = join(rootDir, dir, 'package.json');
		if (!existsSync(pkgPath)) continue;
		const pkg = readJSON(pkgPath) as {
			name?: string;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		const name = pkg.name;
		if (typeof name !== 'string' || name.length === 0) continue;
		dirToName.set(dir, name);
		workspaces.push(name);

		const allDeps: Record<string, string> = {
			...(pkg.dependencies ?? {}),
			...(pkg.peerDependencies ?? {}),
		};
		const deps: string[] = [];
		for (const [depName, spec] of Object.entries(allDeps)) {
			if (
				spec === 'workspace:*' ||
				spec === 'workspace:^' ||
				spec === 'workspace:~'
			) {
				deps.push(depName);
				const dependents = nameToDependents.get(depName) ?? [];
				if (!dependents.includes(name)) dependents.push(name);
				nameToDependents.set(depName, dependents);
			}
		}
		nameToDeps.set(name, deps.sort());
	}

	return {
		rootDir,
		dirToName,
		nameToDeps,
		nameToDependents,
		workspaces,
	};
};

/**
 * Map a single file path (relative to the repo root) to a
 * workspace name. Returns `null` when the file sits outside any
 * workspace — those files trigger the conservative "all" path.
 */
export const fileToWorkspace = (
	graph: IPackageGraph,
	relFile: string,
): string | null => {
	// Longest prefix match so `packages/core/src/foo.ts` lands in
	// `packages/core`, not `packages` (which isn't a workspace).
	let best: { dir: string; name: string } | null = null;
	for (const [dir, name] of graph.dirToName) {
		if (
			(relFile === dir || relFile.startsWith(`${dir}/`)) &&
			(best === null || dir.length > best.dir.length)
		) {
			best = { dir, name };
		}
	}
	return best?.name ?? null;
};

/**
 * Compute the transitive closure (both directions) of affected
 * workspaces from a list of changed files.
 */
export const computeAffected = (
	files: readonly string[],
	graph: IPackageGraph,
): IAffectedResult => {
	const direct = new Set<string>();
	const rootFiles: string[] = [];
	const directByWorkspace = new Map<string, string[]>();

	for (const file of files) {
		const ws = fileToWorkspace(graph, file);
		if (ws === null) {
			rootFiles.push(file);
			continue;
		}
		direct.add(ws);
		const bucket = directByWorkspace.get(ws) ?? [];
		bucket.push(file);
		directByWorkspace.set(ws, bucket);
	}

	// BFS upstream (dependencies).
	const upstream = new Set<string>();
	const upstreamQueue: string[] = [...direct];
	while (upstreamQueue.length > 0) {
		const next = upstreamQueue.shift();
		if (next === undefined) break;
		for (const dep of graph.nameToDeps.get(next) ?? []) {
			if (!upstream.has(dep) && !direct.has(dep)) {
				upstream.add(dep);
				upstreamQueue.push(dep);
			}
		}
	}

	// BFS downstream (dependents).
	const downstream = new Set<string>();
	const downstreamQueue: string[] = [...direct];
	while (downstreamQueue.length > 0) {
		const next = downstreamQueue.shift();
		if (next === undefined) break;
		for (const dep of graph.nameToDependents.get(next) ?? []) {
			if (!downstream.has(dep) && !direct.has(dep)) {
				downstream.add(dep);
				downstreamQueue.push(dep);
			}
		}
	}

	// Final affected set is the union, sorted by input order from
	// the graph (deterministic, matches the workspace declaration
	// order in the root package.json).
	const affectedSet = new Set<string>([
		...direct,
		...upstream,
		...downstream,
	]);
	const affected = graph.workspaces.filter((w) => affectedSet.has(w));
	const vitestProjects = resolveAffectedVitestProjects(graph, affected);

	return {
		mode: 'diff',
		base: null,
		head: null,
		rootFiles: rootFiles.sort(),
		directByWorkspace,
		affected,
		vitestProjects,
		upstream: graph.workspaces.filter((w) => upstream.has(w)),
		downstream: graph.workspaces.filter((w) => downstream.has(w)),
	};
};

/**
 * Get the list of files that changed in `base..head`. Returns an
 * empty array on git failure so callers can decide whether that
 * counts as a hard error.
 */
export const gitDiffNames = (base: string, head: string): readonly string[] => {
	try {
		const stdout = execFileSync(
			'git',
			['diff', '--name-only', `${base}..${head}`],
			{ encoding: 'utf8' },
		);
		return stdout
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`git diff failed for ${base}..${head}: ${reason}`);
	}
};

export interface IWriteArtifactsOptions {
	readonly outputPath: string;
	readonly setPath: string;
	readonly vitestSetPath?: string;
}

export const writeAffectedArtifacts = (
	result: IAffectedResult,
	options: IWriteArtifactsOptions,
): void => {
	const dir = dirname(options.outputPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const payload = {
		mode: result.mode,
		base: result.base,
		head: result.head,
		generatedAt: new Date().toISOString(),
		affected: result.affected,
		vitestProjects: result.vitestProjects,
		upstream: result.upstream,
		downstream: result.downstream,
		rootFiles: result.rootFiles,
		directByWorkspace: Object.fromEntries(result.directByWorkspace),
	};
	writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);

	const setDir = dirname(options.setPath);
	if (!existsSync(setDir)) mkdirSync(setDir, { recursive: true });
	writeFileSync(options.setPath, `${result.affected.join('\n')}\n`);

	if (options.vitestSetPath !== undefined) {
		const vitestSetDir = dirname(options.vitestSetPath);
		if (!existsSync(vitestSetDir)) {
			mkdirSync(vitestSetDir, { recursive: true });
		}
		writeFileSync(
			options.vitestSetPath,
			`${result.vitestProjects.join('\n')}\n`,
		);
	}
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const base = flag(argv, 'base');
	const head = flag(argv, 'head') ?? 'HEAD';
	const outputPath =
		flag(argv, 'output') ?? join('build', 'ci', 'affected.json');
	const setPath =
		flag(argv, 'set-file') ?? join(dirname(outputPath), '.affected-set');
	const vitestSetPath =
		flag(argv, 'vitest-set-file') ??
		join(dirname(outputPath), '.affected-vitest-set');
	const all = hasFlag(argv, 'all');
	const rootDir = repoRoot();
	const relativeOutput = relative(rootDir, outputPath);
	const relativeSet = relative(rootDir, setPath);
	const relativeVitestSet = relative(rootDir, vitestSetPath);

	if (!all && base === undefined) {
		err(
			'affected: --base <ref> is required (or pass --all for the nightly matrix)',
		);
		return 2;
	}

	let result: IAffectedResult;
	try {
		const graph = buildGraph(rootDir);
		if (all) {
			const affected = graph.workspaces;
			result = {
				mode: 'all',
				base: null,
				head: null,
				rootFiles: [],
				directByWorkspace: new Map(),
				affected,
				vitestProjects: resolveAffectedVitestProjects(graph, affected),
				upstream: [],
				downstream: [],
			};
		} else {
			if (base === undefined) {
				err(
					'affected: --base <ref> is required (or pass --all for the nightly matrix)',
				);
				return 2;
			}
			const files = gitDiffNames(base, head);
			result = computeAffected(files, graph);
			result = { ...result, base, head };
		}
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		err(`affected: ${reason}`);
		return 1;
	}

	try {
		writeAffectedArtifacts(result, { outputPath, setPath, vitestSetPath });
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		err(`affected: failed to write artifacts: ${reason}`);
		return 1;
	}

	out(
		`affected: mode=${result.mode} affected=${result.affected.length} ` +
			`upstream=${result.upstream.length} downstream=${result.downstream.length} ` +
			`rootFiles=${result.rootFiles.length}`,
	);
	out(`affected: wrote ${relativeOutput}`);
	out(`affected: wrote ${relativeSet}`);
	out(`affected: wrote ${relativeVitestSet}`);
	return 0;
};

if (import.meta.main) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
