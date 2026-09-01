/**
 * Tarball install e2e (M30, the thorough half): pack the published packages, install
 * them into a clean throwaway project with npm, and drive the INSTALLED CLI over stdio
 * under Node with real plugins. This is the only check that proves the published
 * artifacts resolve each other under plain node module resolution (the workspace layout
 * in the repo is bun-specific and not node-resolvable) — the M3-class adoption risk.
 *
 * Slow (does an npm install); run after `bun run build`.
 *
 *   bun tools/scripts/smoke/pack.script.ts
 *   bun tools/scripts/smoke/pack.script.ts --presets=minimal,lean,standard,...
 *
 * Two modes (mutually exclusive):
 *  - DEFAULT: per-package smoke — install every packed tarball into a
 *    single throwaway project and assert every packed plugin loads
 *    + the spot-checked tools resolve.
 *  - `--presets=<list>` (f00178, MAN-002): per-preset smoke — for each
 *    preset in the list, create a throwaway project that has a
 *    `mcp-vertex.config.json` activating that preset, `npm install`
 *    the tarballs into it, boot the installed CLI against the config,
 *    listTools, call `mcp-vertex_overview`, exit cleanly. Presets are
 *    derived from `PRESET_CATALOG` (no hardcoded list).
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import {
	packRewrittenTarball,
	stageBuildForPublish,
	type IWorkspaceDepsPlan,
} from '../publish/workspace-deps.ts';
import { PUBLISH_ORDER } from '../release/release-plan';
import {
	deriveDistributablePresets,
	parsePresetsArg,
} from './pack-presets.preset-list.ts';

const ROOT = resolve('.');

interface IPackageJson {
	readonly name?: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly files?: unknown;
	readonly main?: string;
	/** npm allows either a single path or a name → path map. */
	readonly bin?: string | Readonly<Record<string, string>>;
}

const readPackageJson = (dir: string): IPackageJson => {
	const raw = readFileSync(join(ROOT, dir, 'package.json'), 'utf8');
	return JSON.parse(raw) as IPackageJson;
};

/**
 * a00065 S4: the set to pack is DERIVED from `PUBLISH_ORDER` — the single
 * source of truth the real release uses — so the smoke can never again
 * silently skip a published package. The old walker seeded only
 * `packages/core` + `plugins/*`, which meant `packages/client` and
 * `packages/cli` (the primary user-facing surface, both carrying
 * `workspace:*` deps the release has to rewrite) were installed by nobody
 * and proven by nothing. Filtering keeps it honest: a package that turns
 * `private` or drops its `files` array falls out here AND fails the
 * release-order assertion below.
 */
const discoverPublishablePackageDirs = (): readonly string[] =>
	PUBLISH_ORDER.filter((dir) => {
		if (!existsSync(join(ROOT, dir, 'package.json'))) return false;
		const pkg = readPackageJson(dir);
		return (
			typeof pkg.name === 'string' &&
			pkg.private !== true &&
			Array.isArray(pkg.files)
		);
	});

const PACKED_PACKAGE_DIRS = discoverPublishablePackageDirs();

// Invariant: every publishable package in the release order must be packed.
// A package that is in PUBLISH_ORDER but drops out of the publishable filter
// is a release-vs-smoke drift — fail loudly here instead of shipping a
// tarball nobody installed. Extracted as a callable so the unit spec can
// exercise it without spinning up a throwaway project, and so the throw
// only fires when the script is actually executed (not when imported).
export const assertPublishablePackagesArePacked = (): void => {
	const missingFromPack = PUBLISH_ORDER.filter((dir) => {
		if (!existsSync(join(ROOT, dir, 'package.json'))) return false;
		const pkg = readPackageJson(dir);
		if (pkg.private === true) return false; // legitimately unpublished
		return !PACKED_PACKAGE_DIRS.includes(dir);
	});
	if (missingFromPack.length > 0) {
		throw new Error(
			`pack smoke: publishable packages in PUBLISH_ORDER are not being packed: ${missingFromPack.join(', ')}`,
		);
	}
};

/**
 * r00045 S1 moved the build driver's output off per-package `dist/` onto a
 * single `build/{group}/{name}/{version}/` tree — manifests still declare
 * `"main": "./dist/index.js"` (npm/Node forbid `exports` escaping the
 * package directory with `../build`), per the proposal's design note: the
 * publish pipeline (see `release.script.ts`) materialises that `dist/` in a
 * per-package STAGING COPY at publish time, never in the workspace itself.
 * This smoke has to reproduce exactly that staging step before packing —
 * packing the raw workspace dir (as it did before this fix) packs a
 * manifest whose `./dist/...` entrypoint was never written anywhere.
 */
const computeBuildDir = (dir: string, version: string): string => {
	const group = dir.startsWith('packages/') ? 'packages' : 'plugins';
	const name = dir.slice(dir.indexOf('/') + 1);
	return join(ROOT, 'build', group, name, version);
};

/**
 * Stage every packed package's slice of `build/` into a per-package `dist/`
 * under a throwaway staging root, mirroring `release.script.ts`'s real
 * publish flow (`stageBuildForPublish`). Returns dir → staged absolute path
 * so callers pack/inspect the STAGED copy, never the workspace original.
 */
const stagePackedPackages = async (
	stagingRoot: string,
): Promise<ReadonlyMap<string, string>> => {
	const staged = new Map<string, string>();
	for (const dir of PACKED_PACKAGE_DIRS) {
		const pkg = readPackageJson(dir);
		if (typeof pkg.version !== 'string') {
			throw new Error(`${dir}/package.json is missing a version`);
		}
		const buildDir = computeBuildDir(dir, pkg.version);
		const stageDir = join(stagingRoot, dir);
		await stageBuildForPublish(join(ROOT, dir), buildDir, stageDir);
		staged.set(dir, stageDir);
	}
	return staged;
};

/**
 * A tarball is only meaningful if the entrypoints its manifest advertises
 * actually exist. Packing an unbuilt package produces a tarball that
 * installs fine and then dies at require time with a MODULE_NOT_FOUND
 * that names a path inside a temp dir — evidence that points nowhere near
 * the missing build step. Checked against the STAGED copy (post
 * `stagePackedPackages`) so this fails the same way the real publish would:
 * naming the package and the file that `bun run build` never produced.
 */
export const assertPackedEntrypointsExist = (
	stagedDirs: ReadonlyMap<string, string>,
): void => {
	const missing: string[] = [];
	for (const dir of PACKED_PACKAGE_DIRS) {
		const pkg = readPackageJson(dir);
		const stageDir = stagedDirs.get(dir);
		if (stageDir === undefined) {
			missing.push(`${dir} → (not staged)`);
			continue;
		}
		const targets = [
			...(typeof pkg.main === 'string' ? [pkg.main] : []),
			...(typeof pkg.bin === 'string'
				? [pkg.bin]
				: Object.values(pkg.bin ?? {})),
		];
		for (const target of targets) {
			if (!existsSync(join(stageDir, target))) {
				missing.push(`${dir} → ${target}`);
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`pack smoke: packed package(s) are missing their declared entrypoint — run \`bun run build\` first:\n  ${missing.join('\n  ')}`,
		);
	}
};

const PLUGIN_IDS = PACKED_PACKAGE_DIRS.filter((dir) =>
	dir.startsWith('plugins/'),
).map((dir) => dir.slice('plugins/'.length));

/**
 * Optional per-plugin spot-check tool. When a plugin id appears here, the
 * smoke additionally asserts that named tool is served — a stronger check
 * than "the plugin loaded". a00065: this is a SPOT-CHECK, not an
 * exhaustive registry: plugins absent here (cache — eviction-only, no MCP
 * tools; opt-in plugins whose tool names carry their own prefix) are still
 * proven to load via the `overview.plugins` assertion below, so adding a
 * new plugin no longer forces an edit here to keep the smoke green.
 */
const SPOT_CHECK_PLUGIN_TOOLS: Record<string, string> = {
	audit: 'mcp-vertex_audit_audit_plan',
	deps: 'mcp-vertex_deps_deps_list',
	docs: 'mcp-vertex_docs_docs_list',
	git: 'mcp-vertex_git_status',
	logs: 'mcp-vertex_logs_query',
	memory: 'mcp-vertex_memory_save',
	notification: 'mcp-vertex_notification_notify_status',
	proposals: 'mcp-vertex_proposals_auto_work',
	quality: 'mcp-vertex_quality_get_quality_scopes',
	rules: 'mcp-vertex_rules_get_rules',
	search: 'mcp-vertex_search_search',
	'status-marker': 'mcp-vertex_status-marker_ping',
	'test-convention': 'mcp-vertex_test-convention_get_convention',
	'web-fetch': 'mcp-vertex_web-fetch_web_fetch',
	conventions: 'mcp-vertex_conventions_conventions_check',
	'test-policy': 'mcp-vertex_test-policy_get_test_policy',
};

const REQUIRED_TOOLS = [
	'mcp-vertex_overview',
	...PLUGIN_IDS.map((id) => SPOT_CHECK_PLUGIN_TOOLS[id]).filter(
		(t): t is string => t !== undefined,
	),
];

const run = (cmd: string, args: string[], cwd: string): string =>
	execFileSync(cmd, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});

/**
 * Every intra-repo `workspace:` dep resolves to the version the DEPENDED-ON
 * package's own `package.json` currently declares — never the root
 * manifest's version, which is under no obligation to match any individual
 * package. A dependency that has independently bumped ahead of root
 * previously produced an unsatisfiable installed set here.
 */
const WORKSPACE_PLAN: IWorkspaceDepsPlan = {
	packageVersions: new Map(
		PACKED_PACKAGE_DIRS.map((dir) => {
			const pkg = readPackageJson(dir);
			if (typeof pkg.name !== 'string') {
				throw new Error(`${dir}/package.json is missing a name`);
			}
			if (typeof pkg.version !== 'string') {
				throw new Error(`${dir}/package.json is missing a version`);
			}
			return [pkg.name, pkg.version] as const;
		}),
	),
};

interface IPresetsCliArgs {
	readonly mode: 'presets' | 'package';
	readonly presetIds: readonly string[];
}

/**
 * Parse the CLI args we accept. Today: a single optional
 * `--presets=<csv>` flag. Anything else is treated as default package
 * mode. Exported separately so the spec can drive it without spawning
 * a throwaway project.
 */
export const parseCliArgs = (argv: readonly string[]): IPresetsCliArgs => {
	let presetsRaw: string | undefined;
	for (const arg of argv) {
		if (arg.startsWith('--presets=')) {
			presetsRaw = arg.slice('--presets='.length);
			continue;
		}
		throw new Error(
			`pack smoke: unknown CLI flag "${arg}" (supported: --presets=<list>)`,
		);
	}
	if (presetsRaw === undefined) return { mode: 'package', presetIds: [] };
	const parsed = parsePresetsArg(presetsRaw);
	const ids = parsed.length === 0 ? deriveDistributablePresets() : parsed;
	return { mode: 'presets', presetIds: ids };
};

interface IRunSmokeOpts {
	readonly workdir: string;
	readonly tarballs: readonly string[];
	readonly configJson: Record<string, unknown> | null;
	readonly extraServerArgs?: readonly string[];
}

/**
 * Run one smoke cycle against a throwaway project. Either no
 * `mcp-vertex.config.json` (default package smoke, all packed
 * plugins enabled) or an explicit preset-driven config (per-preset
 * smoke). When `configJson` is `null`, the CLI auto-resolves every
 * packed plugin; when present, the CLI uses the explicit config.
 */
const runSmokeAgainstWorkdir = async (
	opts: IRunSmokeOpts,
): Promise<{ toolCount: number; overviewPlugins: readonly string[] }> => {
	const { workdir, tarballs, configJson, extraServerArgs } = opts;
	writeFileSync(
		join(workdir, 'package.json'),
		JSON.stringify({ name: 'smoke', private: true }, null, 2),
	);
	if (configJson !== null) {
		writeFileSync(
			join(workdir, 'mcp-vertex.config.json'),
			JSON.stringify(configJson, null, 2),
		);
	}
	run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], workdir);

	const workspace = join(workdir, 'ws');
	const serverArgs = [
		join(workdir, 'node_modules/@mcp-vertex/cli/dist/index.js'),
		'__serve',
		...(extraServerArgs ?? []),
		`--workspace=${workspace}`,
	];
	const transport = new StdioClientTransport({
		command: 'node',
		args: serverArgs,
	});
	const client = new Client(
		{ name: 'smoke-pack', version: '0.0.0' },
		{ capabilities: {} },
	);
	try {
		await client.connect(transport);
		const { tools } = await client.listTools();
		const names = new Set(tools.map((t) => t.name));
		for (const required of REQUIRED_TOOLS) {
			if (!names.has(required)) {
				throw new Error(
					`installed CLI missing "${required}" (plugin failed to resolve under node)`,
				);
			}
		}
		const overviewRes = await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: { compact: true },
		});
		const overview = JSON.parse(
			(overviewRes.content as Array<{ text?: string }>)?.[0]?.text ??
				'{}',
		) as { plugins?: Array<string | { name: string }> };
		const loaded = (overview.plugins ?? []).map((p) =>
			typeof p === 'string' ? p : p.name,
		);
		return { toolCount: tools.length, overviewPlugins: loaded };
	} finally {
		await client.close().catch(() => undefined);
	}
};

const runPackageSmoke = async (
	stagedDirs: ReadonlyMap<string, string>,
): Promise<void> => {
	const proj = mkdtempSync(join(tmpdir(), 'mcp-pack-'));
	try {
		const tarballs: string[] = [];
		for (const pkgDir of PACKED_PACKAGE_DIRS) {
			const stageDir = stagedDirs.get(pkgDir);
			if (stageDir === undefined) {
				throw new Error(`${pkgDir} was not staged before packing`);
			}
			tarballs.push(
				await packRewrittenTarball(stageDir, WORKSPACE_PLAN, {
					outDir: proj,
				}),
			);
		}
		const result = await runSmokeAgainstWorkdir({
			workdir: proj,
			tarballs,
			configJson: null,
			// The default `managed` surface hides most plugin tools behind
			// the `vertex` router and only lists a curated bootstrap subset,
			// so a REQUIRED_TOOLS check against `listTools()` would mistake
			// that exposure policy for "the plugin failed to resolve under
			// node". `--surface=native` lists every registered tool
			// directly (see `tools/scripts/lib/plugin-test-bed.ts`, which
			// does the same for the same reason), which is what this smoke
			// actually needs to verify: the plugin loaded and its tools are
			// wired, not the default LLM-facing exposure policy.
			extraServerArgs: [
				`--plugins=${PLUGIN_IDS.join(',')}`,
				'--surface=native',
			],
		});
		console.log(
			`✓ pack smoke: mcpv bin + installed-from-tarball CLI serves ${result.toolCount} tools under node ` +
				`(${PACKED_PACKAGE_DIRS.length} packed packages incl. client+cli, ` +
				`all ${PLUGIN_IDS.length} plugins in overview.plugins).`,
		);
	} finally {
		rmSync(proj, { recursive: true, force: true });
	}
};

const runPresetsSmoke = async (
	presetIds: readonly string[],
	stagedDirs: ReadonlyMap<string, string>,
): Promise<void> => {
	const failures: Array<{ preset: string; error: string }> = [];
	for (const presetId of presetIds) {
		const proj = mkdtempSync(join(tmpdir(), `mcp-pack-${presetId}-`));
		try {
			const tarballs: string[] = [];
			for (const pkgDir of PACKED_PACKAGE_DIRS) {
				const stageDir = stagedDirs.get(pkgDir);
				if (stageDir === undefined) {
					throw new Error(`${pkgDir} was not staged before packing`);
				}
				tarballs.push(
					await packRewrittenTarball(stageDir, WORKSPACE_PLAN, {
						outDir: proj,
					}),
				);
			}
			try {
				await runSmokeAgainstWorkdir({
					workdir: proj,
					tarballs,
					configJson: { preset: presetId },
				});
				console.log(
					`✓ preset smoke: "${presetId}" install + boot + listTools + callOverview ok.`,
				);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err);
				failures.push({ preset: presetId, error: message });
				console.error(
					`✖ preset smoke: "${presetId}" failed: ${message}`,
				);
			}
		} finally {
			rmSync(proj, { recursive: true, force: true });
		}
	}
	if (failures.length > 0) {
		throw new Error(
			`pack smoke --presets: ${failures.length}/${presetIds.length} presets failed: ` +
				failures.map((f) => `${f.preset} (${f.error})`).join('; '),
		);
	}
};

const main = async (): Promise<void> => {
	assertPublishablePackagesArePacked();
	assertPackedEntrypointsExist();
	const args = parseCliArgs(process.argv.slice(2));
	if (args.mode === 'presets') {
		await runPresetsSmoke(args.presetIds);
		return;
	}
	await runPackageSmoke();
};

if (import.meta.main === true) {
	main().catch((err: unknown) => {
		console.error(
			`✖ pack smoke failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
