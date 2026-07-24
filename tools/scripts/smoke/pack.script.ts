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

import { PUBLISH_ORDER } from '../release/release-plan';

const ROOT = resolve('.');

interface IPackageJson {
	readonly name?: string;
	readonly private?: boolean;
	readonly files?: unknown;
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
// tarball nobody installed.
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

/** The monorepo version every intra-repo `workspace:*` dep resolves to. */
const MONOREPO_VERSION = (readPackageJson('.') as { version?: string }).version;

/**
 * a00065 S4: `npm` cannot install a `workspace:*` dependency. `bun`
 * rewrites it at publish time, but `packages/client` and `packages/cli`
 * carry `@mcp-vertex/core`/`@mcp-vertex/client` as `workspace:*` in
 * DEPENDENCIES (not just devDeps, contrary to the release script's own
 * note) — so an `npm publish` of those two would ship an uninstallable
 * package. This smoke replicates the publish-time rewrite so it proves
 * the tarballs install under npm; the release script applies the same
 * rewrite. Rewrites the source package.json in place, packs, then always
 * restores it in `finally`.
 */
const packWithResolvedWorkspaceDeps = (
	pkgDir: string,
	proj: string,
): string => {
	const pkgPath = join(ROOT, pkgDir, 'package.json');
	const original = readFileSync(pkgPath, 'utf8');
	try {
		const pkg = JSON.parse(original) as Record<string, unknown>;
		for (const section of ['dependencies', 'peerDependencies']) {
			const deps = pkg[section];
			if (typeof deps !== 'object' || deps === null) continue;
			for (const [name, range] of Object.entries(
				deps as Record<string, unknown>,
			)) {
				if (
					typeof range === 'string' &&
					range.startsWith('workspace:')
				) {
					(deps as Record<string, string>)[name] =
						MONOREPO_VERSION ?? '*';
				}
			}
		}
		writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);
		const out = run(
			'npm',
			['pack', resolve(ROOT, pkgDir), '--pack-destination', proj],
			proj,
		).trim();
		return join(proj, out.split('\n').pop()!.trim());
	} finally {
		writeFileSync(pkgPath, original);
	}
};

const main = async (): Promise<void> => {
	const proj = mkdtempSync(join(tmpdir(), 'mcp-pack-'));
	try {
		// Pack each package (with workspace:* deps resolved) into the project.
		const tarballs: string[] = [];
		for (const pkgDir of PACKED_PACKAGE_DIRS) {
			tarballs.push(packWithResolvedWorkspaceDeps(pkgDir, proj));
		}

		// Clean project that installs the tarballs (peer dep @mcp-vertex/core is
		// satisfied by the core tarball; sdk/zod come from the registry).
		writeFileSync(
			join(proj, 'package.json'),
			JSON.stringify({ name: 'smoke', private: true }, null, 2),
		);
		run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], proj);

		// a00065 S4: prove the `@mcp-vertex/cli` package's `bin` entry
		// (`mcpv`) resolves under plain node module resolution — the
		// canonical launch path a real adopter uses, not just the direct
		// `core/dist/cli.js` path. `npm install` links bins into
		// `node_modules/.bin`; invoking it proves the shebang + main resolve
		// and that `@mcp-vertex/cli` located `@mcp-vertex/core` from tarballs.
		const mcpvBin = join(proj, 'node_modules/.bin/mcpv');
		if (!existsSync(mcpvBin)) {
			throw new Error(
				'installed @mcp-vertex/cli did not link its `mcpv` bin — the cli tarball is missing or its bin field is broken',
			);
		}
		const version = run(mcpvBin, ['--version'], proj).trim();
		if (!/\d+\.\d+\.\d+/.test(version)) {
			throw new Error(
				`\`mcpv --version\` returned an unexpected value: ${JSON.stringify(version)}`,
			);
		}

		// Drive the INSTALLED CLI over stdio with real plugins — via the
		// `mcpv __serve` entry (the cli package), proving the whole
		// cli→core→plugins chain resolves from tarballs under node.
		const workspace = join(proj, 'ws');
		const transport = new StdioClientTransport({
			command: 'node',
			args: [
				join(proj, 'node_modules/@mcp-vertex/cli/dist/index.js'),
				'__serve',
				`--plugins=${PLUGIN_IDS.join(',')}`,
				`--workspace=${workspace}`,
			],
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
			// a00065 S4: prove EVERY packed plugin actually loaded — not just
			// the spot-checked ones. `overview.plugins` is the loaded set; a
			// tarball that installed but failed to import (a bad workspace:*
			// rewrite, a missing dep) would be absent here even if some other
			// plugin's spot-check tool happened to be present.
			const overviewRes = await client.callTool({
				name: 'mcp-vertex_overview',
				arguments: { compact: true },
			});
			const overview = JSON.parse(
				(overviewRes.content as Array<{ text?: string }>)?.[0]?.text ??
					'{}',
			) as { plugins?: Array<string | { name: string }> };
			const loaded = new Set(
				(overview.plugins ?? []).map((p) =>
					typeof p === 'string' ? p : p.name,
				),
			);
			const notLoaded = PLUGIN_IDS.filter((id) => !loaded.has(id));
			if (notLoaded.length > 0) {
				throw new Error(
					`installed-from-tarball plugins did not load under node: ${notLoaded.join(', ')} (packed but not in overview.plugins — a resolution/import failure)`,
				);
			}
			console.log(
				`✓ pack smoke: mcpv bin (${version}) + installed-from-tarball CLI serves ${tools.length} tools under node ` +
					`(${PACKED_PACKAGE_DIRS.length} packed packages incl. client+cli, ` +
					`all ${PLUGIN_IDS.length} plugins in overview.plugins).`,
			);
		} finally {
			await client.close().catch(() => undefined);
		}
	} finally {
		rmSync(proj, { recursive: true, force: true });
	}
};

main().catch((err: unknown) => {
	console.error(
		`✖ pack smoke failed: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
