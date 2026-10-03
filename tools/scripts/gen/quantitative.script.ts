#!/usr/bin/env bun
/**
 * quantitative.script.ts — c00140 (Track H of q00006).
 *
 * Single source of truth for every *machine-readable* number the
 * project surfaces in docs. The proposal-driven audit (§34) caught
 * two stale facts:
 *   - `docs/delendai/AGENT-BOOTSTRAP.md` claiming "48 plugins";
 *   - `apps/web/src/data/pages/overview.md` claiming "50 plugins";
 * (and counting tests, packages, MCP resources, etc., all by hand).
 *
 * It writes ONE artifact, `build/inspect/quantitative.json`, which is
 * not committed. It used to also embed a `quantitative` block in
 * `AGENT-BOOTSTRAP.md`, rewritten by a commit hook. A count over the
 * whole repository has no per-branch answer (x00569): every pull request
 * saw a different total, the hook left the bootstrap dirty after
 * commits that never touched it, and the block was stale on the
 * integration branch while taking bytes from the bootstrap's budget.
 * Live counts come from the server (`delendai_overview`); this snapshot
 * is for a person inspecting one checkout.
 *
 * Privacy: this generator only enumerates workspace-relative paths
 * (never absolute paths), plugin ids, and counts. It does NOT
 * surface tool names, host names, or any external identifier — so
 * the R1.1–R1.10 contract holds.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** Schema-versioned snapshot. Bump on breaking changes. */
export const SCHEMA_VERSION = 1;

export interface IKindCount {
	readonly kind: string;
	readonly count: number;
}

export interface IPluginCount {
	readonly total: number;
}

export interface IToolCount {
	readonly total: number;
	/** Indexed by plugin dir name (e.g. `proposals`). */
	readonly byPlugin: Readonly<Record<string, number>>;
}

export interface ITestCount {
	readonly specFiles: number;
	readonly testCases: number;
}

export interface IPackageCount {
	readonly packages: number;
	readonly apps: number;
	readonly extensions: number;
	readonly tools: number;
}

export interface IProposalCount {
	readonly total: number;
	readonly byKind: readonly IKindCount[];
	readonly byStatus: readonly IKindCount[];
}

export interface IQuantitativeSnapshot {
	readonly schemaVersion: number;
	readonly generatedAt: string;
	readonly plugins: IPluginCount;
	readonly tools: IToolCount;
	readonly tests: ITestCount;
	readonly packages: IPackageCount;
	readonly proposals: IProposalCount;
}

const PROPOSAL_KIND_ORDER = [
	'feat',
	'chore',
	'fix',
	'refactor',
	'docs',
	'perf',
	'test',
	'breaking',
	'build',
	'ci',
	'merge',
	'ignore',
] as const;

const PROPOSAL_STATUS_ORDER = [
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
] as const;

/**
 * Directories that are never a workspace, however they are nested.
 *
 * `tools/` is itself a workspace, so `bun install` puts a `node_modules`
 * directly inside it — and this counter reported "4 tooling workspace(s)"
 * on a machine with dependencies installed and "3" on one without. A
 * quantitative fact that measures the state of the installer rather than
 * the repository is worse than no fact: it moved the block on every
 * regeneration, which is what left the shared checkout dirty.
 */
const NEVER_A_WORKSPACE = new Set(['node_modules']);

const listDirs = async (path: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter(
				(e) =>
					e.isDirectory() &&
					!e.name.startsWith('.') &&
					!NEVER_A_WORKSPACE.has(e.name),
			)
			.map((e) => e.name);
	} catch {
		return [];
	}
};

const listFiles = async (
	path: string,
	filter: (name: string) => boolean,
): Promise<readonly string[]> => {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile() && filter(e.name))
			.map((e) => e.name);
	} catch {
		return [];
	}
};

/** Walk `root` recursively (bounded), returning relative paths. */
const walkRel = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'build' ||
					entry.name === 'coverage' ||
					entry.name === '.git'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			out.push(full);
		}
	}
	return out;
};

/** Count plugins with a non-empty `src/` directory. */
export const countPlugins = async (): Promise<IPluginCount> => {
	const pluginsDir = join(REPO_ROOT, 'plugins');
	const names = await listDirs(pluginsDir);
	let total = 0;
	for (const name of names) {
		const manifestPath = join(pluginsDir, name, 'plugin.manifest.ts');
		const srcPath = join(pluginsDir, name, 'src');
		let hasSrc = false;
		try {
			const statResult = await stat(srcPath);
			hasSrc = statResult.isDirectory();
		} catch {
			hasSrc = false;
		}
		if (!hasSrc) continue;
		try {
			// Existence check on the manifest is mostly advisory: the
			// snapshot is a coarse count, so we accept any plugin
			// directory with a `src/` whether or not the manifest has
			// been generated yet (some plugins land in batches).
			await stat(manifestPath);
		} catch {
			// ignored: src/ is enough for the count.
		}
		total += 1;
	}
	return { total };
};

/**
 * Count tools per plugin. Two heuristics, applied in order:
 *   1. `plugin.manifest.ts` declares `toolPermissions: { … }` keyed
 *      by tool id. The number of keys is the most reliable count.
 *   2. If a plugin declares NO `toolPermissions` block, fall back
 *      to `registerTool(` invocations under `src/`.
 *
 * The fallback is necessary for plugins that ship a tool namespace
 * but no permission map yet (the map is opt-in; see f00180 S2).
 * Both heuristics over-count SLIGHTLY (manifests may declare tools
 * before wiring), but never under-count.
 */
export const countTools = async (): Promise<IToolCount> => {
	const perPlugin = new Map<string, number>();
	let total = 0;
	const pluginsDir = join(REPO_ROOT, 'plugins');
	const pluginNames = await listDirs(pluginsDir);
	for (const pluginName of pluginNames) {
		const srcDir = join(pluginsDir, pluginName, 'src');
		const manifestPath = join(pluginsDir, pluginName, 'plugin.manifest.ts');
		let count = 0;
		// Heuristic 1 — toolPermissions object keys.
		try {
			const manifestText = await readFile(manifestPath, 'utf8');
			const m = /toolPermissions\s*:\s*\{([\s\S]*?)\}/.exec(manifestText);
			if (m !== null) {
				const body = m[1] ?? '';
				// Each tool id is its own key like `auto_work:`,
				// `delegate:`, etc. Splitting on `\n` and trimming
				// filters out blank lines.
				count = body
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => /^[a-z][a-z0-9_]+\s*:/.test(line)).length;
			}
		} catch {
			// ignore — fall back to heuristic 2.
		}
		// Heuristic 2 — registerTool invocations under src/.
		if (count === 0) {
			try {
				const files = await walkRel(srcDir);
				for (const file of files) {
					if (!/\.(ts|tsx)$/.test(file)) continue;
					const text = await readFile(file, 'utf8').catch(() => '');
					count += (text.match(/registerTool\s*\(/g) ?? []).length;
				}
			} catch {
				// ignore — no src/ for this plugin.
			}
		}
		perPlugin.set(pluginName, count);
		total += count;
	}
	const byPlugin: Record<string, number> = {};
	for (const [k, v] of perPlugin) byPlugin[k] = v;
	return { total, byPlugin };
};

/** Count test spec files + extract Vitest `it(` / `test(` counts. */
export const countTests = async (): Promise<ITestCount> => {
	let specFiles = 0;
	let testCases = 0;
	const testsRoot = join(REPO_ROOT, 'packages');
	const testFiles = (await walkRel(testsRoot)).filter((f) =>
		f.endsWith('.spec.ts'),
	);
	for (const file of testFiles) {
		if (file.includes('node_modules')) continue;
		specFiles += 1;
		const text = await readFile(file, 'utf8').catch(() => '');
		// `it(` and `test(` are Vitest entry points; `it.each(` /
		// `describe.each(` are likewise counted by the same primitive.
		testCases += (text.match(/\bit\s*\(/g) ?? []).length;
		testCases += (text.match(/\btest\s*\(/g) ?? []).length;
	}
	// Also walk tools/ for tools/scripts/*.spec.ts files.
	const toolsTests = (await walkRel(join(REPO_ROOT, 'tools'))).filter((f) =>
		f.endsWith('.spec.ts'),
	);
	for (const file of toolsTests) {
		specFiles += 1;
		const text = await readFile(file, 'utf8').catch(() => '');
		testCases += (text.match(/\bit\s*\(/g) ?? []).length;
		testCases += (text.match(/\btest\s*\(/g) ?? []).length;
	}
	return { specFiles, testCases };
};

/** Count packages, apps, extensions and standalone tool workspaces. */
export const countPackages = async (): Promise<IPackageCount> => {
	const packages = (await listDirs(join(REPO_ROOT, 'packages'))).length;
	const apps = (await listDirs(join(REPO_ROOT, 'apps'))).length;
	const extensions = (await listDirs(join(REPO_ROOT, 'extensions'))).length;
	const tools = (await listDirs(join(REPO_ROOT, 'tools'))).length;
	return { packages, apps, extensions, tools };
};

/** Count proposals by reading the file-system tree (not the registry). */
export const countProposals = async (): Promise<IProposalCount> => {
	const proposalsRoot = join(REPO_ROOT, 'docs/delendai/proposals');
	const byKind = new Map<string, number>();
	const byStatus = new Map<string, number>();
	let total = 0;
	for (const status of PROPOSAL_STATUS_ORDER) {
		const statusDir = join(proposalsRoot, status);
		const kinds = await listDirs(statusDir);
		for (const kind of kinds) {
			const files = await listFiles(
				join(statusDir, kind),
				(n) => n.endsWith('.md') && /^[a-z]\d{3,5}-.*\.md$/.test(n),
			);
			if (files.length === 0) continue;
			total += files.length;
			byStatus.set(status, (byStatus.get(status) ?? 0) + files.length);
			// Derive the kind from the file name prefix
			// (`f00182-…` → `feat`, `c00140-…` → `chore`, …) so the
			// breakdown aligns with the proposal-id-allocator
			// vocabulary, not the directory name. Unknown prefixes
			// fall under `other` so the count always reconciles.
			for (const file of files) {
				const m = /^([a-z])\d{3,5}-/.exec(file);
				if (m === null) {
					byKind.set('other', (byKind.get('other') ?? 0) + 1);
					continue;
				}
				const kindPrefix = m[1] ?? '?';
				byKind.set(kindPrefix, (byKind.get(kindPrefix) ?? 0) + 1);
			}
		}
	}
	const finalByKind = PROPOSAL_KIND_ORDER.map((kind) => ({
		kind,
		count: byKind.get(kind) ?? 0,
	})).filter((row) => row.count > 0);
	const finalByStatus = PROPOSAL_STATUS_ORDER.map((status) => ({
		kind: status,
		count: byStatus.get(status) ?? 0,
	})).filter((row) => row.count > 0);
	return {
		total,
		byKind: finalByKind,
		byStatus: finalByStatus,
	};
};

export const buildSnapshot = async (
	now: () => Date = () => new Date(),
): Promise<IQuantitativeSnapshot> => {
	const [plugins, tools, tests, packages, proposals] = await Promise.all([
		countPlugins(),
		countTools(),
		countTests(),
		countPackages(),
		countProposals(),
	]);
	return {
		schemaVersion: SCHEMA_VERSION,
		generatedAt: now().toISOString(),
		plugins,
		tools,
		tests,
		packages,
		proposals,
	};
};

/** Pretty Markdown projection of a snapshot. */
export const formatSnapshot = (snap: IQuantitativeSnapshot): string => {
	const lines: string[] = [
		`Generated at: ${snap.generatedAt}`,
		'',
		`Plugins: ${snap.plugins.total}`,
		`Tools: ${snap.tools.total}`,
		`Test specs: ${snap.tests.specFiles} (≈${snap.tests.testCases} cases)`,
		`Workspaces: ${snap.packages.packages} packages, ${snap.packages.apps} apps, ${snap.packages.extensions} extensions, ${snap.packages.tools} tooling workspace(s).`,
		`Proposals: ${snap.proposals.total} on disk (${
			snap.proposals.byStatus
				.map((s) => `${s.kind}=${s.count}`)
				.join(', ') || 'none'
		})`,
	];
	return lines.join('\n');
};

export const writeSnapshotJson = async (
	snap: IQuantitativeSnapshot,
	out: string = join(REPO_ROOT, 'build/inspect/quantitative.json'),
): Promise<string> => {
	const { mkdir } = await import('node:fs/promises');
	await mkdir(join(REPO_ROOT, 'build/inspect'), { recursive: true });
	await writeFile(out, `${JSON.stringify(snap, null, '\t')}\n`);
	return relative(REPO_ROOT, out);
};

export const main = async (_argv: readonly string[]): Promise<number> => {
	const snap = await buildSnapshot();
	const jsonPath = await writeSnapshotJson(snap);
	process.stdout.write(
		`${formatSnapshot(snap)}\n\nquantitative: wrote snapshot to ${jsonPath}\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
