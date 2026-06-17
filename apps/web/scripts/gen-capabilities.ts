/**
 * gen-capabilities.ts — emit `src/data/capabilities.json`, the data source the
 * Astro site renders from. It assembles the REAL server with every plugin and
 * enumerates the live tools over the MCP protocol (`listTools`), plus the
 * published packages + versions, so the site can never drift from the code.
 *
 * Coverage guard: with `--strict` (CI) an undocumented tool fails the build.
 *
 *   bun scripts/gen-capabilities.ts            # write, warn on gaps
 *   bun scripts/gen-capabilities.ts --strict   # write, FAIL on gaps (CI)
 *
 * Requires `bun run build` first (the public API resolves to each package's dist).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
	assembleCliConfig,
	createMcpServer,
	parseCliArgs,
} from '@cartago-git/mcp-core/public';

import proposalsPlugin from '@cartago-git/mcp-proposals';
import rulesPlugin from '@cartago-git/mcp-rules';
import memoryPlugin from '@cartago-git/mcp-memory';
import gitPlugin from '@cartago-git/mcp-git';
import qualityPlugin from '@cartago-git/mcp-quality';
import searchPlugin from '@cartago-git/mcp-search';
import notificationPlugin from '@cartago-git/mcp-notification';
import docsPlugin from '@cartago-git/mcp-docs';
import depsPlugin from '@cartago-git/mcp-deps';

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const ROOT = resolve(HERE, '..', '..', '..'); // repo root
const OUT = resolve(HERE, '..', 'src', 'data', 'capabilities.json');
const PLUGIN_LIST = 'proposals,rules,memory,git,quality,search,notification,docs,deps';
const PLUGINS: Record<string, unknown> = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
};

interface ITool {
	readonly name: string;
	readonly namespace: string;
	readonly description: string;
}

const namespaceOf = (toolName: string): string =>
	toolName.includes('_') ? (toolName.split('_')[0] as string) : 'core';

const collectTools = async (): Promise<ITool[]> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-site-'));
	try {
		const args = parseCliArgs(
			[`--plugins=${PLUGIN_LIST}`, `--workspace=${workspace}`],
			workspace
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => {
				const hit = Object.entries(PLUGINS).find(([k]) => specifier.includes(k));
				return { default: hit ? hit[1] : undefined };
			},
			readFile: () => undefined,
		});
		const assembled = await createMcpServer(config);
		const [ct, st] = InMemoryTransport.createLinkedPair();
		await assembled.server.connect(st);
		const client = new Client({ name: 'site', version: '0.0.0' }, { capabilities: {} });
		await client.connect(ct);
		const { tools } = await client.listTools();
		await client.close();
		await assembled.server.close();
		return tools
			.map((t) => ({
				name: t.name,
				namespace: namespaceOf(t.name),
				description: t.description ?? '',
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
};

const collectPackages = (): Array<{ name: string; version: string }> => {
	const out: Array<{ name: string; version: string }> = [];
	for (const group of ['packages', 'plugins']) {
		for (const dir of readdirSync(join(ROOT, group))) {
			try {
				const pkg = JSON.parse(
					readFileSync(join(ROOT, group, dir, 'package.json'), 'utf8')
				) as { name?: string; version?: string };
				if (pkg.name && pkg.version) out.push({ name: pkg.name, version: pkg.version });
			} catch {
				// not a package dir
			}
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
};

const main = async (): Promise<void> => {
	const strict = process.argv.includes('--strict');
	const coreVersion = (
		JSON.parse(readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8')) as {
			version: string;
		}
	).version;

	const tools = await collectTools();
	const undocumented = tools.filter((t) => t.description.trim().length === 0);
	if (undocumented.length > 0) {
		const msg = `${undocumented.length} tool(s) without a description: ${undocumented.map((t) => t.name).join(', ')}`;
		if (strict) {
			console.error(`✖ gen-capabilities (strict): ${msg}`);
			process.exit(1);
		}
		console.warn(`⚠ gen-capabilities: ${msg}`);
	}

	const packages = collectPackages();
	const capabilities = {
		generatedAt: new Date().toISOString(),
		coreVersion,
		counts: { tools: tools.length, packages: packages.length },
		packages,
		tools,
	};
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(capabilities, null, 2)}\n`);
	console.log(
		`wrote ${OUT} — ${tools.length} tools, ${packages.length} packages, ${undocumented.length} undocumented.`
	);
};

void main();
