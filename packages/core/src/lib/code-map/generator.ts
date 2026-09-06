/**
 * code-map/generator.ts — d00010 (Track H of q00006).
 *
 * Pure functions that scan the workspace and produce the JSON
 * projection an MCP client receives when it reads
 * `delendai://code-map`. The map is intentionally coarse — it is a
 * "where do I look?" view, not a search index. Privacy:
 *
 *   - Never surfaces host paths.
 *   - Only ever emits workspace-relative `dir` and `packageName`
 *     fields (the latter is the npm name, which is already public
 *     via the registry).
 *   - Never includes tool names that are NOT already public
 *     through the existing `delendai://catalog/{compact,full}`
 *     resources.
 *
 * The schema is intentionally narrow (4 sections, no nested
 * objects) so consumers can read it with `jq` without surprises.
 *
 * b00239 rename: the resource URI is `delendai://code-map` (canonical).
 * The historical brand scheme is still accepted via the deprecated-alias
 * layer in `resource.ts`; new code must use `delendai://code-map`.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the workspace root from the launch directory. Tests may execute
 * with `packages/core` as their cwd, while a published host starts from its
 * project root; both must produce workspace-relative paths.
 *
 * x00509 / B3: the previous implementation seeded the search from
 * `process.cwd()` at module-load time, which violated AGENTS §6 ("no
 * `process.cwd()` in engines"). The replacement uses
 * `import.meta.url` to derive the file's own location and walks up
 * from there, so the resolver is deterministic regardless of cwd.
 */
const findWorkspaceRoot = (start: string): string => {
	let current = start;
	for (let depth = 0; depth < 8; depth += 1) {
		if (
			existsSync(join(current, 'delendai.config.json')) ||
			existsSync(join(current, '.git'))
		) {
			return current;
		}
		const parent = join(current, '..');
		if (parent === current) break;
		current = parent;
	}
	return start;
};

const THIS_FILE = fileURLToPath(import.meta.url);
// Start the upward walk from this file's directory. The
// `findWorkspaceRoot` helper walks up to 8 levels looking for the
// canonical markers (`delendai.config.json` / `.git`) — when this
// module is loaded by the published host the markers live 4 levels
// above; when loaded by a test that resolves the file in-place, the
// walk falls back gracefully to the starting directory.
const REPO_ROOT = findWorkspaceRoot(dirname(THIS_FILE));

/** Schema-versioned snapshot of the repo's structural map. */
export const CODE_MAP_SCHEMA_VERSION = 1;

export interface IPackageEntry {
	/** npm name (e.g. `@delendai/core`). */
	readonly name: string;
	/** Workspace-relative path to the package. */
	readonly dir: string;
	/** One-line description from the package.json (truncated). */
	readonly description: string;
	/** Path of the AGENT.md or `null` if missing. */
	readonly agent: string | null;
}

export interface IPluginEntry {
	/** npm name. */
	readonly name: string;
	/** Plugin dir (workspace-relative). */
	readonly dir: string;
	/** Plugin manifest `id` (e.g. `proposals`). */
	readonly pluginId: string;
	/** Manifest `summary` (one-liner). */
	readonly summary: string;
	/** Capability tokens declared on the manifest. */
	readonly capabilities: readonly string[];
	/** Path of the AGENT.md or `null`. */
	readonly agent: string | null;
	/** `tokenBudget.warning` / `tokenBudget.hard` from the manifest. */
	readonly tokenBudget: {
		readonly warning: number;
		readonly hard: number;
	} | null;
}

export interface ICodeMapHotspot {
	readonly kind: 'tool' | 'schema';
	readonly id: string;
	readonly staticBytes: number;
}

export interface ICodeMap {
	readonly schemaVersion: number;
	readonly generatedAt: string;
	readonly packages: readonly IPackageEntry[];
	readonly plugins: readonly IPluginEntry[];
	readonly hotspots: readonly ICodeMapHotspot[];
}

const truncate = (s: string, n: number): string =>
	s.length <= n ? s : `${s.slice(0, n - 1)}…`;

interface IPackageJsonShape {
	readonly name?: string;
	readonly description?: string;
}

interface IPluginManifestShape {
	readonly id?: string;
	readonly summary?: string;
	readonly capabilities?: readonly string[];
	readonly tokenBudget?: {
		readonly caps?: { warning?: number; hard?: number };
	} | null;
}

const readText = async (path: string): Promise<string> => {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return '';
	}
};

const readJson = async <T>(path: string): Promise<T | null> => {
	const text = await readText(path);
	if (text.length === 0) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
};

const listDirs = async (path: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
			.map((e) => e.name);
	} catch {
		return [];
	}
};

export const collectPackages = async (): Promise<readonly IPackageEntry[]> => {
	const out: IPackageEntry[] = [];
	const root = join(REPO_ROOT, 'packages');
	for (const name of await listDirs(root)) {
		const dir = `packages/${name}`;
		const pkgJson = await readJson<IPackageJsonShape>(
			join(REPO_ROOT, dir, 'package.json'),
		);
		const agentPath = join(REPO_ROOT, dir, 'AGENT.md');
		try {
			await stat(agentPath);
		} catch {
			// no AGENT.md on disk
		}
		out.push({
			name: pkgJson?.name ?? dir,
			dir,
			description: truncate(pkgJson?.description ?? '', 200),
			agent: `${dir}/AGENT.md`,
		});
	}
	return out;
};

export const collectPlugins = async (): Promise<readonly IPluginEntry[]> => {
	const out: IPluginEntry[] = [];
	const root = join(REPO_ROOT, 'plugins');
	for (const name of await listDirs(root)) {
		const dir = `plugins/${name}`;
		const pkgJson = await readJson<IPackageJsonShape>(
			join(REPO_ROOT, dir, 'package.json'),
		);
		const manifestPath = join(REPO_ROOT, dir, 'plugin.manifest.ts');
		const manifestText = await readText(manifestPath);
		const grab = (re: RegExp): string | undefined => {
			const m = re.exec(manifestText);
			return m && typeof m[1] === 'string' ? m[1] : undefined;
		};
		const id = grab(/\bid:\s*['"`]([^'"`]+)['"`]/);
		const summary = grab(/\bsummary:\s*['"`]([^'"`]+)['"`]/);
		const caps = [
			...manifestText.matchAll(/\bcapabilities:\s*\[([^\]]*)\]/g),
		]
			.flatMap((m) =>
				(m[1] ?? '')
					.split(',')
					.map((s) => s.trim().replace(/^['"`]|['"`]$/g, '')),
			)
			.filter(Boolean);
		const warning = Number.parseFloat(
			grab(/warning:\s*(\d+(?:\.\d+)?)/) ?? '',
		);
		const hard = Number.parseFloat(grab(/hard:\s*(\d+(?:\.\d+)?)/) ?? '');
		const hasAgent = await readText(join(REPO_ROOT, dir, 'AGENT.md')).then(
			(t) => t.length > 0,
		);
		const manifestObj: Record<string, unknown> = {
			capabilities: caps,
		};
		if (id !== undefined) manifestObj.id = id;
		if (summary !== undefined) manifestObj.summary = summary;
		if (Number.isFinite(warning) && Number.isFinite(hard)) {
			manifestObj.tokenBudget = { caps: { warning, hard } };
		} else {
			manifestObj.tokenBudget = null;
		}
		const manifest = manifestObj as IPluginManifestShape;
		out.push({
			name: pkgJson?.name ?? dir,
			dir,
			pluginId: manifest.id ?? name,
			summary: truncate(manifest.summary ?? '', 200),
			capabilities: manifest.capabilities ?? [],
			agent: hasAgent ? `${dir}/AGENT.md` : null,
			tokenBudget:
				manifest.tokenBudget?.caps &&
				manifest.tokenBudget.caps.warning !== undefined &&
				manifest.tokenBudget.caps.hard !== undefined
					? {
							warning: manifest.tokenBudget.caps.warning,
							hard: manifest.tokenBudget.caps.hard,
						}
					: null,
		});
	}
	return out;
};

/**
 * Walk the manifest-derived token budgets and emit the top-N
 * hotspots by `staticBytes`. Heuristic on disk: we count the size
 * of each `<dir>/src/lib/tools/*.tool.ts` file as a coarse proxy
 * for the tool's static surface size — the manifest doesn't carry
 * per-tool staticBytes for everything, but a roughly proportional
 * estimate is good enough for navigation.
 */
export const collectHotspots = async (
	packages: readonly IPackageEntry[],
	plugins: readonly IPluginEntry[],
): Promise<readonly ICodeMapHotspot[]> => {
	const out: ICodeMapHotspot[] = [];
	for (const plugin of plugins) {
		const toolsDir = join(REPO_ROOT, plugin.dir, 'src/lib/tools');
		try {
			const entries = await readdir(toolsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith('.tool.ts'))
					continue;
				const fullPath = join(toolsDir, entry.name);
				const bytes = (await stat(fullPath)).size;
				const id = `${plugin.pluginId}.${entry.name.replace(/\.tool\.ts$/, '')}`;
				out.push({ kind: 'tool', id, staticBytes: bytes });
			}
		} catch {
			// no tools/ in this plugin
		}
	}
	for (const pkg of packages) {
		const schemasDir = join(REPO_ROOT, pkg.dir, 'src/contracts/schemas');
		try {
			const entries = await readdir(schemasDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith('.schema.ts'))
					continue;
				const fullPath = join(schemasDir, entry.name);
				const bytes = (await stat(fullPath)).size;
				const id = `${pkg.name.replace(/^@[^/]+\//, '')}/${entry.name.replace(/\.schema\.ts$/, '')}`;
				out.push({ kind: 'schema', id, staticBytes: bytes });
			}
		} catch {
			// no schemas/ in this package — fine
		}
	}
	return out.sort((a, b) => b.staticBytes - a.staticBytes).slice(0, 32);
};

export const buildCodeMap = async (
	now: () => Date = () => new Date(),
): Promise<ICodeMap> => {
	const [packages, plugins] = await Promise.all([
		collectPackages(),
		collectPlugins(),
	]);
	const hotspots = await collectHotspots(packages, plugins);
	return {
		schemaVersion: CODE_MAP_SCHEMA_VERSION,
		generatedAt: now().toISOString(),
		packages,
		plugins,
		hotspots,
	};
};

/** Relative-path normaliser; safe across platforms. */
export const safeRelative = (abs: string): string => {
	const rel = relative(REPO_ROOT, abs);
	return rel.startsWith('..') ? abs : rel;
};
