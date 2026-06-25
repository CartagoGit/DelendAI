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
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

const discoverPublishablePluginDirs = (): readonly string[] => {
	const dirs: string[] = ['packages/core'];
	for (const entry of readdirSync(join(ROOT, 'plugins'), {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory()) continue;
		const dir = `plugins/${entry.name}`;
		if (!existsSync(join(ROOT, dir, 'package.json'))) continue;
		const pkg = readPackageJson(dir);
		if (
			typeof pkg.name === 'string' &&
			pkg.private !== true &&
			Array.isArray(pkg.files)
		) {
			dirs.push(dir);
		}
	}
	return dirs.sort((a, b) => {
		if (a === 'packages/core') return -1;
		if (b === 'packages/core') return 1;
		return a.localeCompare(b);
	});
};

const PACKED_PACKAGE_DIRS = discoverPublishablePluginDirs();
const PLUGIN_IDS = PACKED_PACKAGE_DIRS.filter((dir) =>
	dir.startsWith('plugins/'),
).map((dir) => dir.slice('plugins/'.length));

const REQUIRED_PLUGIN_TOOLS: Record<string, string> = {
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
};

const REQUIRED_TOOLS = [
	'mcp-vertex_overview',
	...PLUGIN_IDS.map((id) => {
		const tool = REQUIRED_PLUGIN_TOOLS[id];
		if (tool === undefined) {
			throw new Error(
				`pack smoke has no required-tool mapping for plugin "${id}"`,
			);
		}
		return tool;
	}),
];

const run = (cmd: string, args: string[], cwd: string): string =>
	execFileSync(cmd, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});

const main = async (): Promise<void> => {
	const proj = mkdtempSync(join(tmpdir(), 'mcp-pack-'));
	try {
		// Pack each package into the throwaway project dir.
		const tarballs: string[] = [];
		for (const pkgDir of PACKED_PACKAGE_DIRS) {
			const out = run(
				'npm',
				['pack', resolve(ROOT, pkgDir), '--pack-destination', proj],
				proj,
			).trim();
			tarballs.push(join(proj, out.split('\n').pop()!.trim()));
		}

		// Clean project that installs the tarballs (peer dep @mcp-vertex/core is
		// satisfied by the core tarball; sdk/zod come from the registry).
		writeFileSync(
			join(proj, 'package.json'),
			JSON.stringify({ name: 'smoke', private: true }, null, 2),
		);
		run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], proj);

		// Drive the INSTALLED CLI over stdio with real plugins.
		const workspace = join(proj, 'ws');
		const transport = new StdioClientTransport({
			command: 'node',
			args: [
				join(proj, 'node_modules/@mcp-vertex/core/dist/cli.js'),
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
			console.log(
				`✓ pack smoke: installed-from-tarball CLI serves ${tools.length} tools under node ` +
					`(${PACKED_PACKAGE_DIRS.length} packed packages, ` +
					`${PLUGIN_IDS.length} plugins resolved).`,
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
