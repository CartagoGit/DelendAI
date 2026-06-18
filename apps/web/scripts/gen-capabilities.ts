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
} from '@mcp-vertex/core/public';

import proposalsPlugin from '@mcp-vertex/proposals';
import rulesPlugin from '@mcp-vertex/rules';
import memoryPlugin from '@mcp-vertex/memory';
import gitPlugin from '@mcp-vertex/git';
import qualityPlugin from '@mcp-vertex/quality';
import searchPlugin from '@mcp-vertex/search';
import notificationPlugin from '@mcp-vertex/notification';
import docsPlugin from '@mcp-vertex/docs';
import depsPlugin from '@mcp-vertex/deps';

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
	readonly effects?: readonly string[];
}

/** A measured, real payload size (bytes of the tool result text the agent sees). */
interface IBenchmark {
	readonly id: string;
	readonly label: string;
	readonly bytes: number;
	readonly tokens: number;
}

interface ICollected {
	readonly tools: ITool[];
	readonly benchmarks: IBenchmark[];
}

const namespaceOf = (toolName: string): string =>
	toolName.includes('_') ? (toolName.split('_')[0] as string) : 'core';

/** Assemble the real server for a plugin list and return a connected client. */
const buildClient = async (
	pluginList: string,
	workspace: string
): Promise<{ client: Client; close: () => Promise<void> }> => {
	const args = parseCliArgs(
		[`--plugins=${pluginList}`, `--workspace=${workspace}`],
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
	return {
		client,
		close: async () => {
			await client.close();
			await assembled.server.close();
		},
	};
};

// Benchmarks are measured on the documented cold-start config (proposals +
// memory, matching docs/TOKEN-BUDGETS.md) so the figures line up with the
// "<300 tokens to orient" promise — the full tool list above still shows all 9.
const BENCH_PLUGINS = 'proposals,memory';

const collectBenchmarks = async (): Promise<IBenchmark[]> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-bench-'));
	try {
		const { client, close } = await buildClient(BENCH_PLUGINS, workspace);
		// Measure the REAL payloads over the protocol (bytes of the result text
		// the agent sees ≈ 4 bytes/token). Honest, live, drift-proof.
		const measure = async (
			id: string,
			label: string,
			name: string,
			toolArgs: Record<string, unknown> = {}
		): Promise<IBenchmark | undefined> => {
			try {
				const res = (await client.callTool({ name, arguments: toolArgs })) as {
					content?: Array<{ text?: string }>;
				};
				const text = res.content?.[0]?.text ?? '';
				const bytes = Buffer.byteLength(text, 'utf8');
				if (bytes === 0) return undefined;
				return { id, label, bytes, tokens: Math.round(bytes / 4) };
			} catch {
				return undefined;
			}
		};
		const measured = await Promise.all([
			measure('overview_full', 'overview (full)', 'mcpcore_overview'),
			measure('overview_compact', 'overview (compact)', 'mcpcore_overview', {
				compact: true,
			}),
			measure('auto_work', 'auto_work', 'proposals_auto_work'),
		]);
		await close();
		return measured.filter((b): b is IBenchmark => b !== undefined);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
};

const collectTools = async (): Promise<ICollected> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-site-'));
	try {
		const { client, close } = await buildClient(PLUGIN_LIST, workspace);
		const { tools } = await client.listTools();
		// Side effects (M31) live in overview, not the MCP tool definition — merge
		// them in so the site can badge write/spawn/destructive tools.
		const overview = (await client.callTool({
			name: 'mcpcore_overview',
			arguments: {},
		})) as { structuredContent?: { tools?: Array<{ name: string; effects?: string[] }> } };
		const effectsByName = new Map<string, string[]>(
			(overview.structuredContent?.tools ?? [])
				.filter((t) => t.effects && t.effects.length > 0)
				.map((t) => [t.name, t.effects as string[]])
		);
		await close();
		return {
			tools: tools
				.map((t) => ({
					name: t.name,
					namespace: namespaceOf(t.name),
					description: t.description ?? '',
					...(effectsByName.has(t.name) ? { effects: effectsByName.get(t.name) } : {}),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
			benchmarks: await collectBenchmarks(),
		};
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

	const { tools, benchmarks } = await collectTools();
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
		benchmarks,
	};
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(capabilities, null, 2)}\n`);
	console.log(
		`wrote ${OUT} — ${tools.length} tools, ${packages.length} packages, ${benchmarks.length} benchmarks, ${undocumented.length} undocumented.`
	);
};

void main();
