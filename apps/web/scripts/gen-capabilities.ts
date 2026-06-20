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
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { parseInputSchema } from './lib/parse-input-schema';
import {
	discoverTutorials,
	groupByPluginLang,
	type ITutorial,
} from './lib/discover-tutorials';
import { resolveI18nDescriptions } from './lib/resolve-i18n-descriptions';
import { languages as supportedLanguages } from '../src/i18n/shared';

import {
	assembleCliConfig,
	createMcpProject,
	parseCliArgs,
} from '@mcp-vertex/core/public';

import proposalsPlugin from '@mcp-vertex/proposals';
import rulesPlugin from '@mcp-vertex/rules';
import memoryPlugin from '@mcp-vertex/memory';
import gitPlugin from '@mcp-vertex/git';
import qualityPlugin from '@mcp-vertex/quality';
import searchPlugin from '@mcp-vertex/search';
import notificationPlugin from '@mcp-vertex/notification';
import statusMarkerPlugin from '@mcp-vertex/status-marker';
import testConventionPlugin from '@mcp-vertex/test-convention';
import auditPlugin from '@mcp-vertex/audit';
import docsPlugin from '@mcp-vertex/docs';
import depsPlugin from '@mcp-vertex/deps';

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const ROOT = resolve(HERE, '..', '..', '..'); // repo root
const OUT = resolve(HERE, '..', 'src', 'data', 'capabilities.json');
const PLUGIN_LIST =
	'proposals,rules,memory,git,quality,search,notification,status-marker,test-convention,audit,docs,deps';
const PLUGINS: Record<string, unknown> = {
	'mcp-proposals': proposalsPlugin,
	'mcp-rules': rulesPlugin,
	'mcp-memory': memoryPlugin,
	'mcp-git': gitPlugin,
	'mcp-quality': qualityPlugin,
	'mcp-search': searchPlugin,
	'mcp-notification': notificationPlugin,
	'mcp-status-marker': statusMarkerPlugin,
	'mcp-test-convention': testConventionPlugin,
	'mcp-audit': auditPlugin,
	'mcp-docs': docsPlugin,
	'mcp-deps': depsPlugin,
};

interface ITool {
	readonly name: string;
	readonly namespace: string;
	readonly description: string;
	readonly effects?: readonly string[];
	/**
	 * Parsed argument list (from the MCP `inputSchema`). Omitted when the
	 * tool declares no input. The site renders it as an "Argument · Type
	 * · Required · Description" table under each tool.
	 */
	readonly inputSchema?: {
		readonly fields: ReadonlyArray<{
			readonly name: string;
			readonly type: string;
			readonly required: boolean;
			readonly description?: string;
		}>;
	};
	/**
	 * Optional 12-language description block, precomputed at build time
	 * from the per-tool i18n catalogue (see `resolveI18nDescriptions`).
	 * When present, the SSR renderer uses it directly and skips the
	 * runtime `describeTool()` lookup. Only tools with a `descriptionKey`
	 * declared on their `IToolRegistration` AND an entry in the catalogue
	 * will get this block.
	 */
	readonly i18n?: Readonly<Record<string, string>>;
}

/** A measured, real payload size (bytes of the tool result text the agent sees). */
interface IBenchmark {
	readonly id: string;
	readonly label: string;
	readonly bytes: number;
	readonly tokens: number;
}

interface IPrompt {
	readonly name: string;
	readonly description: string;
	readonly namespace: string;
	readonly arguments?: ReadonlyArray<{
		readonly name: string;
		readonly description: string;
		readonly required?: boolean;
	}>;
}

interface IResource {
	readonly uri: string;
	readonly name: string;
	readonly description: string;
	readonly namespace: string;
	readonly mimeType?: string;
}

interface IKnowledgeEntry {
	readonly id: string;
	readonly title: string;
	readonly namespace: string;
}

interface ICollected {
	readonly tools: ITool[];
	readonly prompts: IPrompt[];
	readonly resources: IResource[];
	readonly knowledge: IKnowledgeEntry[];
	readonly benchmarks: IBenchmark[];
}

const namespaceOf = (toolName: string): string =>
	toolName.includes('_') ? (toolName.split('_')[0] as string) : 'core';

/** Assemble the real server for a plugin list and return a connected client. */
const buildClient = async (
	pluginList: string,
	workspace: string,
): Promise<{ client: Client; close: () => Promise<void> }> => {
	const args = parseCliArgs(
		[`--plugins=${pluginList}`, `--workspace=${workspace}`],
		workspace,
	);
	const { config } = await assembleCliConfig(args, {
		import: async (specifier: string) => {
			const hit = Object.entries(PLUGINS).find(([k]) =>
				specifier.includes(k),
			);
			return { default: hit ? hit[1] : undefined };
		},
		readFile: () => undefined,
	});
	const assembled = await createMcpProject(config);
	const [ct, st] = InMemoryTransport.createLinkedPair();
	await assembled.server.connect(st);
	const client = new Client(
		{ name: 'site', version: '0.0.0' },
		{ capabilities: {} },
	);
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
			toolArgs: Record<string, unknown> = {},
		): Promise<IBenchmark | undefined> => {
			try {
				const res = (await client.callTool({
					name,
					arguments: toolArgs,
				})) as {
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
			measure('overview_full', 'overview (full)', 'mcp-vertex_overview'),
			measure(
				'overview_compact',
				'overview (compact)',
				'mcp-vertex_overview',
				{
					compact: true,
				},
			),
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
		// Query tools + prompts + resources + knowledge in parallel. Each call
		// is independently optional: an SDK without listPrompts is fine, we
		// just won't render the /prompts page.
		const [toolsRes, promptsRes, resourcesRes] = await Promise.all([
			client.listTools(),
			(client.listPrompts?.() ??
				Promise.resolve({ prompts: [] })) as Promise<{
				prompts: Array<{
					name: string;
					description?: string;
					arguments?: Array<{
						name: string;
						description?: string;
						required?: boolean;
					}>;
				}>;
			}>,
			(client.listResources?.() ??
				Promise.resolve({ resources: [] })) as Promise<{
				resources: Array<{
					uri: string;
					name: string;
					description?: string;
					mimeType?: string;
				}>;
			}>,
		]);
		// Side effects (M31) live in overview, not the MCP tool definition — merge
		// them in so the site can badge write/spawn/destructive tools.
		const overview = (await client.callTool({
			name: 'mcp-vertex_overview',
			arguments: {},
		})) as {
			structuredContent?: {
				tools?: Array<{ name: string; effects?: string[] }>;
				knowledge?: Array<{ id: string; title: string }>;
			};
		};
		const effectsByName = new Map<string, string[]>(
			(overview.structuredContent?.tools ?? [])
				.filter((t) => t.effects && t.effects.length > 0)
				.map((t) => [t.name, t.effects as string[]]),
		);
		const knowledgeRaw = overview.structuredContent?.knowledge ?? [];
		await close();
		// Precomputed i18n blocks for tools with an entry in the catalogue.
		// Built once outside the loop so the per-tool map lookup is O(1).
		const i18nByName = resolveI18nDescriptions();
		return {
			tools: toolsRes.tools
				.map((t) => {
					const parsedSchema = parseInputSchema(t.inputSchema);
					const i18nBlock = i18nByName[t.name];
					return {
						name: t.name,
						namespace: namespaceOf(t.name),
						description: t.description ?? '',
						...(effectsByName.has(t.name)
							? { effects: effectsByName.get(t.name) }
							: {}),
						// Only emit `inputSchema` when the parser actually
						// returned fields (so the JSON stays minimal for tools
						// with no args).
						...(parsedSchema && parsedSchema.fields.length > 0
							? { inputSchema: { fields: parsedSchema.fields } }
							: {}),
						// Only emit `i18n` when the catalogue has this tool's
						// 12-lang block. Tools without an entry fall back to
						// the runtime English description (see s4-bis note).
						...(i18nBlock ? { i18n: i18nBlock } : {}),
					};
				})
				.sort((a, b) => a.name.localeCompare(b.name)),
			prompts: (promptsRes.prompts ?? [])
				.map((p) => ({
					name: p.name,
					description: p.description ?? '',
					namespace: namespaceOf(p.name),
					...(p.arguments && p.arguments.length > 0
						? {
								arguments: p.arguments.map((a) => ({
									name: a.name,
									description: a.description ?? '',
									...(a.required ? { required: true } : {}),
								})),
							}
						: {}),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
			resources: (resourcesRes.resources ?? [])
				.map((r) => ({
					uri: r.uri,
					name: r.name,
					description: r.description ?? '',
					namespace: namespaceOf(
						r.uri.replace(/^[a-z]+:\/\//, '').replace(/-/g, '_'),
					),
					...(r.mimeType ? { mimeType: r.mimeType } : {}),
				}))
				.sort((a, b) => a.uri.localeCompare(b.uri)),
			knowledge: knowledgeRaw
				.map((k) => ({
					id: k.id,
					title: k.title,
					namespace: namespaceOf(k.id.replace(/-/g, '_')),
				}))
				.sort((a, b) => a.id.localeCompare(b.id)),
			benchmarks: await collectBenchmarks(),
		};
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
};

/** Extract a plugin's optional configExample (see `IPluginConfigExample`). */
const configExampleOf = (pkgName: string) => {
	const shortName = pkgName.replace('@mcp-vertex/', '');
	for (const [key, plugin] of Object.entries(PLUGINS)) {
		if (key.includes(shortName) && plugin && typeof plugin === 'object') {
			const ex = (plugin as { configExample?: unknown }).configExample;
			if (
				ex &&
				typeof ex === 'object' &&
				'summary' in ex &&
				'options' in ex
			) {
				return ex as {
					summary: string;
					options: Record<string, unknown>;
				};
			}
		}
	}
	return undefined;
};

const collectPackages = (): Array<{
	name: string;
	version: string;
	configExample?: { summary: string; options: Record<string, unknown> };
}> => {
	const out: Array<{
		name: string;
		version: string;
		configExample?: { summary: string; options: Record<string, unknown> };
	}> = [];
	for (const group of ['packages', 'plugins']) {
		for (const dir of readdirSync(join(ROOT, group))) {
			try {
				const pkg = JSON.parse(
					readFileSync(
						join(ROOT, group, dir, 'package.json'),
						'utf8',
					),
				) as { name?: string; version?: string };
				if (!pkg.name || !pkg.version) continue;
				const configExample = configExampleOf(pkg.name);
				out.push({
					name: pkg.name,
					version: pkg.version,
					...(configExample ? { configExample } : {}),
				});
			} catch {
				// not a package dir
			}
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
};

/** Walk `plugins/<plugin>/tutorials/<lang>/*.md` and return the flat
 *  catalogue. See p100 s7. */
const collectTutorials = (): ITutorial[] => {
	const langCodes = supportedLanguages.map((l) => l.code);
	const all = discoverTutorials(join(ROOT, 'plugins'), langCodes, {
		listDirs: (p) => {
			try {
				return readdirSync(p);
			} catch {
				return [];
			}
		},
		readFile: (p) => {
			try {
				return readFileSync(p, 'utf8');
			} catch {
				return undefined;
			}
		},
		join: (...parts) => join(...parts),
	});
	// The renderer wants `Map<plugin, Map<lang, ITutorial[]>>` for fast
	// per-page lookup; serialise it as an array of
	// `{ plugin, lang, items }` so the JSON stays flat and inspectable.
	const grouped = groupByPluginLang(all);
	const flat: ITutorial[] = [];
	for (const [, langMap] of grouped.entries()) {
		for (const [, items] of langMap.entries()) {
			// Flatten to per-(plugin,lang) entries with a stable order.
			flat.push(...items);
		}
	}
	return flat;
};

const main = async (): Promise<void> => {
	const strict = process.argv.includes('--strict');
	const coreVersion = (
		JSON.parse(
			readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8'),
		) as {
			version: string;
		}
	).version;

	const { tools, prompts, resources, knowledge, benchmarks } =
		await collectTools();
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
	const tutorials = collectTutorials();
	const capabilities = {
		generatedAt: new Date().toISOString(),
		coreVersion,
		counts: {
			tools: tools.length,
			prompts: prompts.length,
			resources: resources.length,
			knowledge: knowledge.length,
			packages: packages.length,
			tutorials: tutorials.length,
		},
		packages,
		tools,
		prompts,
		resources,
		knowledge,
		tutorials,
		benchmarks,
	};
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(capabilities, null, 2)}\n`);
	console.log(
		`wrote ${OUT} — ${tools.length} tools, ${prompts.length} prompts, ${resources.length} resources, ${knowledge.length} knowledge, ${packages.length} packages, ${tutorials.length} tutorials, ${benchmarks.length} benchmarks, ${undocumented.length} undocumented.`,
	);
};

void main();
