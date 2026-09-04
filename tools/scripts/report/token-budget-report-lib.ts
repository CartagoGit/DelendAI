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
	type IMcpToolSurfaceMode,
	type IPresetKind,
} from '@delendai/core/public';

import {
	jsonBytes,
	measureToolComponentBytes,
	type IToolComponentBytes,
} from './tool-component-breakdown.helper';

export { jsonBytes };

export interface IConnectedBudgetClient {
	readonly client: Client;
	readonly pluginIds: readonly string[];
	readonly loadErrors: readonly string[];
	readonly close: () => Promise<void>;
}

export const DYNAMIC_SURFACE_CLIENT_CAPABILITIES: ClientCapabilities = {
	extensions: {
		'delendai/surface': {
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
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
}

/** One tool's component breakdown, tagged with the owner it rolls up into. */
export interface IToolBreakdownRow extends IToolComponentBytes {
	readonly owner: string;
}

export interface IToolListMetrics {
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
	readonly maxPluginBytes: number;
	readonly ownerRows: readonly IToolOwnerMetrics[];
	/** Per-tool component breakdown; parts sum to `totalBytes` for every row. */
	readonly toolBreakdowns: readonly IToolBreakdownRow[];
}

export type IToolListEntry = {
	readonly name: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown | undefined;
	readonly outputSchema?: unknown | undefined;
};

export const classifyToolOwner = (
	toolName: string,
	pluginIds: readonly string[],
): string => {
	const qualifiedPrefix = 'delendai_';
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

const emptyOwnerMetrics = (owner: string): IToolOwnerMetrics => ({
	owner,
	toolCount: 0,
	toolsListBytes: 0,
	schemaBytes: 0,
	descriptionBytes: 0,
	inputSchemaBytes: 0,
	outputSchemaBytes: 0,
	annotationsBytes: 0,
	otherFieldBytes: 0,
	envelopeBytes: 0,
});

export const measureToolListMetrics = (
	tools: readonly IToolListEntry[],
	pluginIds: readonly string[],
): IToolListMetrics => {
	const ownerTotals = new Map<string, IToolOwnerMetrics>();
	const toolBreakdowns: IToolBreakdownRow[] = [];
	for (const tool of tools) {
		const owner = classifyToolOwner(tool.name, pluginIds);
		// `tool` is the real wire object the client received — casting to
		// `IToolListEntry` above narrows the *type*, not the runtime shape,
		// so any extra field (e.g. `annotations`) is still present here.
		const breakdown = measureToolComponentBytes(
			tool as Readonly<Record<string, unknown>>,
		);
		toolBreakdowns.push({ owner, ...breakdown });
		const current = ownerTotals.get(owner) ?? emptyOwnerMetrics(owner);
		ownerTotals.set(owner, {
			owner,
			toolCount: current.toolCount + 1,
			toolsListBytes: current.toolsListBytes + breakdown.totalBytes,
			schemaBytes:
				current.schemaBytes +
				breakdown.inputSchemaBytes +
				breakdown.outputSchemaBytes,
			descriptionBytes:
				current.descriptionBytes + breakdown.descriptionBytes,
			inputSchemaBytes:
				current.inputSchemaBytes + breakdown.inputSchemaBytes,
			outputSchemaBytes:
				current.outputSchemaBytes + breakdown.outputSchemaBytes,
			annotationsBytes:
				current.annotationsBytes + breakdown.annotationsBytes,
			otherFieldBytes:
				current.otherFieldBytes + breakdown.otherFieldBytes,
			envelopeBytes: current.envelopeBytes + breakdown.envelopeBytes,
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
		annotationsBytes: ownerRows.reduce(
			(sum, row) => sum + row.annotationsBytes,
			0,
		),
		otherFieldBytes: ownerRows.reduce(
			(sum, row) => sum + row.otherFieldBytes,
			0,
		),
		envelopeBytes: ownerRows.reduce(
			(sum, row) => sum + row.envelopeBytes,
			0,
		),
		maxPluginBytes,
		ownerRows,
		toolBreakdowns,
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
					id: 'delendai-token-budget-playbook',
					version: '1.0.0',
					minCoreVersion: '0.1.0',
					bodyPath:
						'packages/core/skills/delendai-token-budget-playbook/SKILL.md',
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
		readonly surfaceMode?: IMcpToolSurfaceMode;
		readonly clientInfo?: Implementation;
		readonly capabilities?: ClientCapabilities;
	},
): Promise<IConnectedBudgetClient> => {
	const argv = [
		`--${options.preset === true ? 'preset' : 'plugins'}=${options.pluginList}`,
		`--workspace=${workspace}`,
		'--cacheDir=.cache/delendai',
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
		'delendai',
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
		name: 'delendai_proposals_sync_proposals',
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

/**
 * The exact JSON text the `tools/list` byte count is derived from. Real
 * tokenizers need this text (not just its byte length) to produce a
 * measured token count instead of a byte-ratio estimate.
 */
export const toolsListJsonText = (tools: readonly IToolListEntry[]): string =>
	JSON.stringify(tools);
