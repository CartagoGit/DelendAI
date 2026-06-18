/**
 * Tarball install e2e (M30, the thorough half): pack the published packages, install
 * them into a clean throwaway project with npm, and drive the INSTALLED CLI over stdio
 * under Node with real plugins. This is the only check that proves the published
 * artifacts resolve each other under plain node module resolution (the workspace layout
 * in the repo is bun-specific and not node-resolvable) — the M3-class adoption risk.
 *
 * Slow (does an npm install); run after `bun run build`.
 *
 *   bun scripts/smoke-pack.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = resolve('.');
const PACKAGES = [
	'packages/core',
	'plugins/proposals',
	'plugins/memory',
];

const run = (cmd: string, args: string[], cwd: string): string =>
	execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const main = async (): Promise<void> => {
	const proj = mkdtempSync(join(tmpdir(), 'mcp-pack-'));
	try {
		// Pack each package into the throwaway project dir.
		const tarballs: string[] = [];
		for (const pkgDir of PACKAGES) {
			const out = run('npm', ['pack', resolve(ROOT, pkgDir), '--pack-destination', proj], proj).trim();
			tarballs.push(join(proj, out.split('\n').pop()!.trim()));
		}

		// Clean project that installs the tarballs (peer dep @mcp-vertex/core is
		// satisfied by the core tarball; sdk/zod come from the registry).
		writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'smoke', private: true }, null, 2));
		run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], proj);

		// Drive the INSTALLED CLI over stdio with real plugins.
		const workspace = join(proj, 'ws');
		const transport = new StdioClientTransport({
			command: 'node',
			args: [
				join(proj, 'node_modules/@mcp-vertex/core/dist/cli.js'),
				'--plugins=proposals,memory',
				`--workspace=${workspace}`,
			],
		});
		const client = new Client({ name: 'smoke-pack', version: '0.0.0' }, { capabilities: {} });
		try {
			await client.connect(transport);
			const { tools } = await client.listTools();
			const names = new Set(tools.map((t) => t.name));
			for (const required of ['mcp-vertex_overview', 'proposals_auto_work', 'memory_save']) {
				if (!names.has(required)) {
					throw new Error(`installed CLI missing "${required}" (plugin failed to resolve under node)`);
				}
			}
			console.log(
				`✓ pack smoke: installed-from-tarball CLI serves ${tools.length} tools under node ` +
					`(core + proposals + memory resolved).`
			);
		} finally {
			await client.close().catch(() => undefined);
		}
	} finally {
		rmSync(proj, { recursive: true, force: true });
	}
};

main().catch((err: unknown) => {
	console.error(`✖ pack smoke failed: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
