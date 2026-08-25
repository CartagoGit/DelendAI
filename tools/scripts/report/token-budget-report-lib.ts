import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import {
	assembleCliConfig,
	createMcpProject,
	nodeDynamicImport,
	parseCliArgs,
	SKILL_MANIFEST_REL,
	type IPresetKind,
} from '@mcp-vertex/core/public';

export interface IConnectedBudgetClient {
	readonly client: Client;
	readonly pluginIds: readonly string[];
	readonly loadErrors: readonly string[];
	readonly close: () => Promise<void>;
}

export const DYNAMIC_SURFACE_CLIENT_CAPABILITIES: ClientCapabilities = {
	extensions: {
		'mcp-vertex/surface': {
			toolsListChanged: true,
		},
	},
};

export const DYNAMIC_SURFACE_CLIENT_INFO: Implementation = {
	name: 'token-budget-report',
	version: '0.0.0',
};

export interface IToolOwnerMetrics {
	readonly owner: string;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
}

export interface IToolListMetrics {
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly maxPluginBytes: number;
	readonly ownerRows: readonly IToolOwnerMetrics[];
}

type IToolListEntry = {
	readonly name: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown | undefined;
	readonly outputSchema?: unknown | undefined;
};

export const jsonBytes = (value: unknown): number => {
	if (value === undefined) {
		return 0;
	}
	return Buffer.byteLength(JSON.stringify(value), 'utf8');
};

export const classifyToolOwner = (
	toolName: string,
	pluginIds: readonly string[],
): string => {
	const qualifiedPrefix = 'mcp-vertex_';
	const unqualified = toolName.startsWith(qualifiedPrefix)
		? toolName.slice(qualifiedPrefix.length)
		: toolName;
	for (const pluginId of [...pluginIds].sort(
		(left, right) => right.length - left.length,
	)) {
		if (unqualified.startsWith(`${pluginId}_`)) {
			return pluginId;
		}
	}
	return 'core';
};

export const measureToolListMetrics = (
	tools: readonly IToolListEntry[],
	pluginIds: readonly string[],
): IToolListMetrics => {
	const ownerTotals = new Map<string, IToolOwnerMetrics>();
	for (const tool of tools) {
		const owner = classifyToolOwner(tool.name, pluginIds);
		const entryBytes = jsonBytes(tool);
		const descriptionBytes = Buffer.byteLength(
			tool.description ?? '',
			'utf8',
		);
		const inputSchemaBytes = jsonBytes(tool.inputSchema);
		const outputSchemaBytes = jsonBytes(tool.outputSchema);
		const schemaBytes = inputSchemaBytes + outputSchemaBytes;
		const current = ownerTotals.get(owner) ?? {
			owner,
			toolCount: 0,
			toolsListBytes: 0,
			schemaBytes: 0,
			descriptionBytes: 0,
			inputSchemaBytes: 0,
			outputSchemaBytes: 0,
		};
		ownerTotals.set(owner, {
			owner,
			toolCount: current.toolCount + 1,
			toolsListBytes: current.toolsListBytes + entryBytes,
			schemaBytes: current.schemaBytes + schemaBytes,
			descriptionBytes: current.descriptionBytes + descriptionBytes,
			inputSchemaBytes: current.inputSchemaBytes + inputSchemaBytes,
			outputSchemaBytes: current.outputSchemaBytes + outputSchemaBytes,
		});
	}
	const ownerRows = ['core', ...pluginIds]
		.filter((owner, index, rows) => rows.indexOf(owner) === index)
		.map((owner) => ownerTotals.get(owner))
		.filter((row): row is IToolOwnerMetrics => row !== undefined);
	const maxPluginBytes = Math.max(
		0,
		...ownerRows
			.filter((row) => row.owner !== 'core')
			.map((row) => row.toolsListBytes),
	);
	return {
		toolCount: tools.length,
		toolsListBytes: jsonBytes(tools),
		schemaBytes: ownerRows.reduce((sum, row) => sum + row.schemaBytes, 0),
		descriptionBytes: ownerRows.reduce(
			(sum, row) => sum + row.descriptionBytes,
			0,
		),
		inputSchemaBytes: ownerRows.reduce(
			(sum, row) => sum + row.inputSchemaBytes,
			0,
		),
		outputSchemaBytes: ownerRows.reduce(
			(sum, row) => sum + row.outputSchemaBytes,
			0,
		),
		maxPluginBytes,
		ownerRows,
	};
};

export const createTokenBudgetFixtureWorkspace = (): string => {
	const workspace = mkdtempSync(join(tmpdir(), 'tok-report-'));
	mkdirSync(join(workspace, 'docs'), { recursive: true });
	mkdirSync(join(workspace, 'src'), { recursive: true });
	writeFileSync(
		join(workspace, 'docs', 'README.md'),
		[
			'# Proposal workflow',
			'',
			'Use proposal slices and compact docs.',
		].join('\n'),
	);
	writeFileSync(
		join(workspace, 'src', 'app.ts'),
		['export const proposal = "compact search baseline";'].join('\n'),
	);
	mkdirSync(join(workspace, 'docs', 'proposals'), { recursive: true });
	const skillManifestAbs = join(workspace, ...SKILL_MANIFEST_REL.split('/'));
	mkdirSync(dirname(skillManifestAbs), { recursive: true });
	writeFileSync(
		skillManifestAbs,
		JSON.stringify({
			generatedAt: '2026-06-25T00:00:00.000Z',
			skills: [
				{
					id: 'mcp-vertex-token-budget-playbook',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath:
						'packages/core/skills/mcp-vertex-token-budget-playbook/SKILL.md',
					tags: ['metrics', 'compact'],
				},
			],
		}),
	);
	writeFileSync(
		join(workspace, 'docs', 'proposals', 'index.json'),
		JSON.stringify({
			generated_at: '2026-06-25T00:00:00.000Z',
			count: 3,
			proposals: [
				{
					id: 'f00056',
					title: 'Agent discovery catalog',
					track: 'host+extension+skills+docs',
					status: 'ready',
					date: '2026-06-25',
				},
				{
					id: 'c00002',
					title: 'Pause npm publish',
					track: 'docs+release',
					status: 'paused',
					date: '2026-06-21',
				},
				{
					id: 'a00001',
					title: 'Repository audit',
					track: 'archive',
					status: 'done',
					date: '2026-06-15',
				},
			],
		}),
	);
	return workspace;
};

export const destroyTokenBudgetFixtureWorkspace = (workspace: string): void => {
	rmSync(workspace, { recursive: true, force: true });
};

export const connectTokenBudgetClient = async (
	workspace: string,
	options: {
		readonly pluginList: string;
		readonly preset?: boolean;
		readonly surfaceMode?: 'native' | 'adaptive' | 'compact';
		readonly clientInfo?: Implementation;
		readonly capabilities?: ClientCapabilities;
	},
): Promise<IConnectedBudgetClient> => {
	const argv = [
		`--${options.preset === true ? 'preset' : 'plugins'}=${options.pluginList}`,
		`--workspace=${workspace}`,
		...(options.surfaceMode !== undefined
			? [`--surface=${options.surfaceMode}`]
			: []),
	];
	const args = parseCliArgs(argv, workspace);
	const assembledConfig = await assembleCliConfig(args, {
		import: async (specifier: string) =>
			(await nodeDynamicImport(specifier)) as { default: unknown },
		readFile: async () => undefined,
	});
	const assembledProject = await createMcpProject(assembledConfig.config);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await assembledProject.server.connect(serverTransport);
	const client = new Client(
		options.clientInfo ?? DYNAMIC_SURFACE_CLIENT_INFO,
		{ capabilities: options.capabilities ?? {} },
	);
	await client.connect(clientTransport);
	return {
		client,
		pluginIds: args.plugins,
		loadErrors: assembledConfig.loadResult.errors.map(
			(entry) => `${entry.specifier}: ${entry.message}`,
		),
		close: async () => {
			await client.close();
			await assembledProject.server.close();
		},
	};
};

export const measureToolTextBytes = async (
	client: Client,
	name: string,
	args: Record<string, unknown>,
): Promise<number> => {
	const result = await client.callTool({ name, arguments: args });
	const text = (result.content as Array<{ type: string; text?: string }>)[0]
		?.text;
	return Buffer.byteLength(text ?? '', 'utf8');
};

export const seedAutoWorkReadyProposal = async (
	workspace: string,
	client: Client,
): Promise<void> => {
	const proposalDir = join(
		workspace,
		'docs',
		'mcp-vertex',
		'proposals',
		'ready',
	);
	mkdirSync(proposalDir, { recursive: true });
	writeFileSync(
		join(proposalDir, 'p9000-token-budget.md'),
		`---
id: p9000
status: ready
type: proposal
track: tests
date: 2026-07-25
kind: perf
title: token budget fixture
---

# p9000 — token budget fixture

## Slices

- global_gate: type

### S1 — bounded payload
- **Files**: \`src/app.ts\`
- **Gate**: type
- **Status**: pending
`,
	);
	await client.callTool({
		name: 'mcp-vertex_proposals_sync_proposals',
		arguments: {},
	});
};

export const listToolsMetrics = async (
	client: Client,
	pluginIds: readonly string[],
): Promise<IToolListMetrics> => {
	const toolList = await client.listTools();
	return measureToolListMetrics(
		toolList.tools as readonly IToolListEntry[],
		pluginIds,
	);
};

export const asPresetId = (value: string): IPresetKind => value as IPresetKind;
