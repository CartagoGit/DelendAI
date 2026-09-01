import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import z from 'zod';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';

const workspaces: string[] = [];
const testWorkspace = (): string => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-vertex-core-meta-'));
	workspaces.push(workspace);
	return workspace;
};

afterEach(() => {
	for (const workspace of workspaces.splice(0)) {
		rmSync(workspace, { recursive: true, force: true });
	}
});

const fakePlugin = {
	name: 'demo',
	version: '9.9.9',
	describe: 'demo plugin',
	register: () => ({
		activation: [
			{
				id: 'ext.demo-child',
				origin: 'external' as const,
				source: 'config' as const,
				toolCount: 0,
				configuration: {
					options: { enabled: true, command: 'demo-child' },
					optionsSchema: z.object({
						enabled: z.boolean().optional(),
						command: z.string(),
					}),
					configExample: { enabled: false, command: 'demo-child' },
				},
			},
		],
		tools: [
			{
				id: 'do',
				summary: 'does the thing',
				register: async () => {},
			},
			{
				id: 'long',
				summary:
					'This summary is intentionally long enough to prove the overview keeps full payloads bounded while still surfacing a useful one-line description.',
				register: async () => {},
			},
		],
		knowledge: [{ id: 'demo-guide', title: 'Demo guide', body: 'BODY' }],
	}),
};

const callTool = async (
	tool: IToolRegistration,
	args: unknown = {},
): Promise<any> => {
	let handler: (a: unknown) => Promise<{
		content: Array<{ text: string }>;
		structuredContent?: unknown;
	}>;
	await tool.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	const result = (await handler!(args)) as {
		content: Array<{ text: string }>;
		structuredContent?: unknown;
	};
	return (
		result.structuredContent ?? JSON.parse(result.content[0]?.text ?? '{}')
	);
};

const assemble = async () => {
	const workspace = testWorkspace();
	const args = parseCliArgs(
		['--plugins=demo', `--workspace=${workspace}`],
		'/cwd',
	);
	const { config } = await assembleCliConfig(args, {
		import: async () => ({ default: fakePlugin }),
		readFile: async () =>
			JSON.stringify({
				validationMatrix: {
					scopes: {
						full: [{ command: 'bun test', expect: 'exit0' }],
					},
				},
			}),
	});
	const byId = (id: string): IToolRegistration =>
		config.extraTools!.find((tool) => tool.id === id)!;
	return { config, byId };
};

const assembleNoConfig = async () => {
	const workspace = testWorkspace();
	const args = parseCliArgs(
		['--plugins=demo', `--workspace=${workspace}`],
		'/cwd',
	);
	const { config } = await assembleCliConfig(args, {
		import: async () => ({ default: fakePlugin }),
		readFile: async () => undefined,
	});
	const byId = (id: string): IToolRegistration =>
		config.extraTools!.find((tool) => tool.id === id)!;
	return { config, byId };
};

describe('core meta-tools', async () => {
	it('overview maps the server, plugins, tools (with summaries) and knowledge', async () => {
		const { byId } = await assemble();
		const snap = await callTool(byId('overview'));
		expect(snap.plugins.map((p: { name: string }) => p.name)).toContain(
			'demo',
		);
		expect(
			snap.tools.find(
				(t: { name: string }) => t.name === 'mcp-vertex_demo_do',
			)?.summary,
		).toBe('does the thing');
		expect(snap.knowledge.map((k: { id: string }) => k.id)).toContain(
			'demo-guide',
		);
		expect(typeof snap.recommendedNextAction).toBe('string');
		expect(snap.activationReport).toBeUndefined();
	});

	it('routes first-use orientation to adopt_project when no config file exists (f00157)', async () => {
		const { byId } = await assembleNoConfig();
		const snap = await callTool(byId('overview'));
		expect(snap.recommendedNextAction).toMatch(/adopt_project/);
		expect(snap.knowledge.map((k: { id: string }) => k.id)).toContain(
			'no-config-file',
		);
	});

	it('overview exposes activation origin, source and tool count only on request', async () => {
		const { byId } = await assemble();
		const snap = await callTool(byId('overview'), { activation: true });
		expect(snap.activationReport).toEqual({
			entries: [
				{
					id: 'demo',
					origin: 'bundled',
					active: true,
					source: 'flag',
					toolCount: 2,
				},
				{
					id: 'ext.demo-child',
					origin: 'external',
					active: true,
					source: 'config',
					toolCount: 0,
				},
			],
			counts: { bundled: 1, 'user-local': 0, external: 1 },
			totalTools: 2,
		});
	});

	it('warns about active plugin tools not exercised in this session', async () => {
		const { config, byId } = await assemble();
		const first = await callTool(byId('overview'));
		expect(first.unusedActivePlugins).toEqual(['demo']);

		config.metricsRegistry?.record('mcp-vertex_demo_do', {
			ms: 1,
			bytes: 0,
			isError: false,
		});
		const afterUse = await callTool(byId('overview'), { compact: true });
		expect(afterUse.unusedActivePlugins).toBeUndefined();
	});

	it('configuration center preserves schema metadata from composed children', async () => {
		const { byId } = await assemble();
		const page = await callTool(byId('configuration_center'), {
			section: 'plugins',
			limit: 100,
		});
		const child = page.plugins.find(
			(entry: { id: string }) => entry.id === 'ext.demo-child',
		);
		expect(child).toMatchObject({
			origin: 'external',
			schemaStatus: 'available',
			options: { enabled: true, command: 'demo-child' },
			configExample: { enabled: false, command: 'demo-child' },
		});
		expect(child.optionsSchema.properties).toMatchObject({
			enabled: { type: 'boolean' },
			command: { type: 'string' },
		});
	});

	it('activation report reconciles preset and local-path config sources after loading', async () => {
		const workspace = testWorkspace();
		const args = parseCliArgs(
			['--preset=minimal', `--workspace=${workspace}`],
			'/cwd',
		);
		const { config } = await assembleCliConfig(args, {
			import: async (specifier) => ({
				default: {
					name: specifier.includes('local.js')
						? 'my-local'
						: (specifier.split('/').at(-1) ?? specifier),
					optionsSchema: z.object({
						mode: z.enum(['safe', 'fast']).optional(),
					}),
					register: () => ({ tools: [] }),
				},
			}),
			readFile: async (absolutePath) =>
				absolutePath.endsWith('mcp-vertex.config.json')
					? JSON.stringify({
							plugins: {
								'my-local': { path: './local.js' },
								rules: { enabled: false, origin: 'bundled' },
							},
						})
					: undefined,
		});
		const overview = config.extraTools!.find(
			(tool) => tool.id === 'overview',
		)!;
		const snap = await callTool(overview, { activation: true });

		expect(
			snap.activationReport.entries.map(
				(entry: {
					id: string;
					origin: string;
					source: string;
					active: boolean;
				}) =>
					`${entry.id}:${entry.origin}:${entry.source}:${entry.active}`,
			),
		).toEqual([
			'git:bundled:preset:true',
			'rules:bundled:config:false',
			'search:bundled:preset:true',
			'my-local:user-local:config:true',
		]);

		const center = config.extraTools!.find(
			(tool) => tool.id === 'configuration_center',
		)!;
		const plugins = await callTool(center, {
			section: 'plugins',
			limit: 100,
		});
		expect(
			plugins.plugins.find(
				(entry: { id: string }) => entry.id === 'my-local',
			),
		).toMatchObject({ origin: 'user-local', schemaStatus: 'available' });
	});

	it('knowledge lists ids and fetches a body by id', async () => {
		const { byId } = await assemble();
		const list = await callTool(byId('knowledge'));
		expect(list.entries.map((e: { id: string }) => e.id)).toContain(
			'demo-guide',
		);
		const got = await callTool(byId('knowledge'), { id: 'demo-guide' });
		expect(got.body).toBe('BODY');
		const missing = await callTool(byId('knowledge'), { id: 'nope' });
		expect(missing.ok).toBe(false);
	});

	it('get_validation_matrix returns the configured commands', async () => {
		const { byId } = await assemble();
		const matrix = await callTool(byId('get_validation_matrix'));
		expect(matrix.scopes.full[0].command).toBe('bun test');
	});

	it('overview compact:true groups tool stems by plugin (low-token)', async () => {
		const { byId } = await assemble();
		const compact = await callTool(byId('overview'), { compact: true });
		// Grouped record { <plugin>: [stem, …], core: [stem, …] }: the shared
		// `<prefix>_<plugin>_` is stated once per group, not per tool.
		expect(Array.isArray(compact.tools)).toBe(false);
		expect(typeof compact.tools).toBe('object');
		// core tools (e.g. overview) are grouped under `core` as bare stems.
		expect(compact.tools.core).toContain('overview');
		// the demo plugin's tools are stems (no `mcp-vertex_demo_` prefix).
		expect(Array.isArray(compact.tools.demo)).toBe(true);
		expect(
			compact.tools.demo.every((s: string) => !s.includes('mcp-vertex_')),
		).toBe(true);
		expect(compact.plugins).toContain('demo');
		expect(compact.activationReport).toBeUndefined();
	});

	it('compact overview can opt into the same activation report', async () => {
		const { byId } = await assemble();
		const compact = await callTool(byId('overview'), {
			compact: true,
			activation: true,
		});
		expect(compact.activationReport.entries[0]).toMatchObject({
			id: 'demo',
			source: 'flag',
			toolCount: 2,
		});
	});

	it('overview full bounds long tool summaries', async () => {
		const { byId } = await assemble();
		const snap = await callTool(byId('overview'));
		const summary = snap.tools.find(
			(t: { name: string }) => t.name === 'mcp-vertex_demo_long',
		)?.summary;
		expect(summary).toHaveLength(96);
		expect(summary.endsWith('...')).toBe(true);
	});
});
