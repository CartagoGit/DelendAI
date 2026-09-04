import { TOKEN_BUDGETS } from '@delendai/core/public';

import {
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
	jsonBytes,
	listToolsMetrics,
	type IToolBreakdownRow,
	type IToolListMetrics,
	type IToolOwnerMetrics,
} from '../report/token-budget-report-lib';

const BYTES_PER_ESTIMATED_TOKEN = TOKEN_BUDGETS.bytesPerEstimatedToken;
const PROJECT_CONTEXT_ROUTE = {
	domain: 'core',
	action: 'project_context',
	args: {},
} as const;

export const TASK_CONTEXT_CORPUS = [
	{
		label: 'cold start',
		route: null,
	},
	{
		label: 'after search.search',
		route: {
			domain: 'search',
			action: 'search',
			args: { query: 'proposal', maxResults: 2, context: 0 },
		},
	},
	{
		label: 'after docs.docs_list',
		route: {
			domain: 'docs',
			action: 'docs_list',
			args: { limit: 2 },
		},
	},
	{
		label: 'after logs.tail',
		route: {
			domain: 'logs',
			action: 'tail',
			args: { limit: 1, kindFilter: 'token-budget-fixture-absent' },
		},
	},
] as const;

export interface ITaskContextSample {
	readonly label: string;
	readonly bytes: number;
	readonly estimatedTokens: number;
}

export interface IBytePercentileSummary {
	readonly sampleCount: number;
	readonly p50Bytes: number;
	readonly p95Bytes: number;
	readonly p50EstimatedTokens: number;
	readonly p95EstimatedTokens: number;
}

export interface ICatalogPayloadMeasurement {
	readonly compactBytes: number;
	readonly compactEstimatedTokens: number;
	readonly fullBytes: number;
	readonly fullEstimatedTokens: number;
}

export interface ICatalogBreakdownMeasurement {
	readonly label: string;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly estimatedTokens: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
	readonly maxPluginBytes: number;
	readonly ownerRows: readonly IToolOwnerMetrics[];
	readonly topTools: readonly IToolBreakdownRow[];
}

export interface ITaskContextCostMeasurement extends IBytePercentileSummary {
	readonly presetId: 'swarm';
	readonly surfaceMode: 'managed';
	readonly route: 'core.project_context via vertex';
	readonly samples: readonly ITaskContextSample[];
}

export interface IMeasureCatalogAndTaskContextCostResult {
	readonly catalog: {
		readonly agentCatalog: ICatalogPayloadMeasurement;
		readonly nativeCore: ICatalogBreakdownMeasurement;
		readonly swarmNative: ICatalogBreakdownMeasurement;
	};
	readonly taskContext: ITaskContextCostMeasurement;
}

interface IToolResultLike {
	readonly structuredContent?: unknown;
	readonly content?: readonly {
		readonly type?: string;
		readonly text?: string;
	}[];
}

const estimateTokens = (bytes: number): number =>
	Math.ceil(bytes / BYTES_PER_ESTIMATED_TOKEN);

const waitForAsyncFixtureWritesToSettle = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 50));
};

const nearestRankPercentileIndex = (
	sampleCount: number,
	percentile: number,
): number => {
	if (sampleCount <= 0) return 0;
	const rank = Math.ceil((percentile / 100) * sampleCount) - 1;
	return Math.min(Math.max(rank, 0), sampleCount - 1);
};

export const nearestRankPercentile = (
	values: readonly number[],
	percentile: number,
): number => {
	if (values.length === 0) {
		throw new Error('nearestRankPercentile requires at least one sample');
	}
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[nearestRankPercentileIndex(sorted.length, percentile)] ?? 0;
};

export const summarizeBytePercentiles = (
	values: readonly number[],
): IBytePercentileSummary => {
	if (values.length === 0) {
		throw new Error(
			'summarizeBytePercentiles requires at least one sample',
		);
	}
	const p50Bytes = nearestRankPercentile(values, 50);
	const p95Bytes = nearestRankPercentile(values, 95);
	return {
		sampleCount: values.length,
		p50Bytes,
		p95Bytes,
		p50EstimatedTokens: estimateTokens(p50Bytes),
		p95EstimatedTokens: estimateTokens(p95Bytes),
	};
};

const toCatalogBreakdown = (
	label: string,
	metrics: IToolListMetrics,
): ICatalogBreakdownMeasurement => ({
	label,
	toolCount: metrics.toolCount,
	toolsListBytes: metrics.toolsListBytes,
	estimatedTokens: estimateTokens(metrics.toolsListBytes),
	schemaBytes: metrics.schemaBytes,
	descriptionBytes: metrics.descriptionBytes,
	inputSchemaBytes: metrics.inputSchemaBytes,
	outputSchemaBytes: metrics.outputSchemaBytes,
	annotationsBytes: metrics.annotationsBytes,
	otherFieldBytes: metrics.otherFieldBytes,
	envelopeBytes: metrics.envelopeBytes,
	maxPluginBytes: metrics.maxPluginBytes,
	ownerRows: metrics.ownerRows,
	topTools: [...metrics.toolBreakdowns]
		.sort((left, right) => right.totalBytes - left.totalBytes)
		.slice(0, 10),
});

export const measureToolResultPayloadBytes = (
	result: IToolResultLike,
): number => {
	if (result.structuredContent !== undefined) {
		return jsonBytes(result.structuredContent);
	}
	const text = (result.content ?? [])
		.filter(
			(
				entry,
			): entry is { readonly type: string; readonly text: string } =>
				entry.type === 'text' && typeof entry.text === 'string',
		)
		.map((entry) => entry.text)
		.join('\n');
	return Buffer.byteLength(text, 'utf8');
};

const measureProjectContextBytes = async (
	client: Awaited<ReturnType<typeof connectTokenBudgetClient>>['client'],
): Promise<number> =>
	measureToolResultBytes(client, 'mcp-vertex_vertex', PROJECT_CONTEXT_ROUTE);

const measureToolResultBytes = async (
	client: Awaited<ReturnType<typeof connectTokenBudgetClient>>['client'],
	name: string,
	args: Record<string, unknown>,
): Promise<number> => {
	const result = (await client.callTool({
		name,
		arguments: args,
	})) as unknown as IToolResultLike;
	return measureToolResultPayloadBytes(result as IToolResultLike);
};

const measureTaskContextCost = async (
	client: Awaited<ReturnType<typeof connectTokenBudgetClient>>['client'],
): Promise<ITaskContextCostMeasurement> => {
	const samples: ITaskContextSample[] = [];
	for (const step of TASK_CONTEXT_CORPUS) {
		if (step.route !== null) {
			await client.callTool({
				name: 'mcp-vertex_vertex',
				arguments: step.route,
			});
		}
		const bytes = await measureProjectContextBytes(client);
		samples.push({
			label: step.label,
			bytes,
			estimatedTokens: estimateTokens(bytes),
		});
	}
	const summary = summarizeBytePercentiles(
		samples.map((sample) => sample.bytes),
	);
	return {
		presetId: 'swarm',
		surfaceMode: 'managed',
		route: 'core.project_context via vertex',
		samples,
		...summary,
	};
};

export const measureCatalogAndTaskContextCost =
	async (): Promise<IMeasureCatalogAndTaskContextCostResult> => {
		const workspace = createTokenBudgetFixtureWorkspace();
		const nativeCore = await connectTokenBudgetClient(workspace, {
			pluginList: '',
			surfaceMode: 'native',
		});
		const swarmNative = await connectTokenBudgetClient(workspace, {
			pluginList: 'swarm',
			preset: true,
			surfaceMode: 'native',
		});
		const swarmManaged = await connectTokenBudgetClient(workspace, {
			pluginList: 'swarm',
			preset: true,
			surfaceMode: 'managed',
		});
		try {
			const compactBytes = await measureToolResultBytes(
				nativeCore.client,
				'mcp-vertex_agent_catalog',
				{ mode: 'compact' },
			);
			const fullBytes = await measureToolResultBytes(
				nativeCore.client,
				'mcp-vertex_agent_catalog',
				{ mode: 'full' },
			);
			const [nativeCoreMetrics, swarmNativeMetrics, taskContext] =
				await Promise.all([
					listToolsMetrics(nativeCore.client, nativeCore.pluginIds),
					listToolsMetrics(swarmNative.client, swarmNative.pluginIds),
					measureTaskContextCost(swarmManaged.client),
				]);
			return {
				catalog: {
					agentCatalog: {
						compactBytes,
						compactEstimatedTokens: estimateTokens(compactBytes),
						fullBytes,
						fullEstimatedTokens: estimateTokens(fullBytes),
					},
					nativeCore: toCatalogBreakdown(
						'native core catalog',
						nativeCoreMetrics,
					),
					swarmNative: toCatalogBreakdown(
						'swarm native preset',
						swarmNativeMetrics,
					),
				},
				taskContext,
			};
		} finally {
			await Promise.all([
				nativeCore.close(),
				swarmNative.close(),
				swarmManaged.close(),
			]);
			await waitForAsyncFixtureWritesToSettle();
			destroyTokenBudgetFixtureWorkspace(workspace);
		}
	};

const markdownTable = (
	headers: readonly string[],
	rows: ReadonlyArray<readonly string[]>,
): string => {
	const separator = headers.map(() => '---');
	return [
		`| ${headers.join(' | ')} |`,
		`| ${separator.join(' | ')} |`,
		...rows.map((row) => `| ${row.join(' | ')} |`),
	].join('\n');
};

const formatInt = (value: number): string => value.toLocaleString('en-US');

export const renderCatalogAndTaskContextMarkdown = (
	measurement: IMeasureCatalogAndTaskContextCostResult,
): string =>
	[
		'## Catalog and task context cost addendum',
		'',
		'Measured with `bun tools/scripts/measure/catalog-task-context-cost.script.ts` against the same synthetic fixture workspace used by the token budget suite. Result bytes are computed from `structuredContent` when present and fall back to concatenated text content otherwise, so compact structured responses and classic text tools are measured on the same reproducible basis. The existing real-preset, plugin-marginal and top-tool tables below remain the schema breakdown source; this addendum pins the extra S1 measurements for `agent_catalog` payloads and routed `project_context` task context snapshots.',
		'',
		markdownTable(
			['Catalog payload', 'Surface', 'Bytes', 'Est. Tokens'],
			[
				[
					'agent_catalog compact',
					'native',
					formatInt(measurement.catalog.agentCatalog.compactBytes),
					formatInt(
						measurement.catalog.agentCatalog.compactEstimatedTokens,
					),
				],
				[
					'agent_catalog full',
					'native',
					formatInt(measurement.catalog.agentCatalog.fullBytes),
					formatInt(
						measurement.catalog.agentCatalog.fullEstimatedTokens,
					),
				],
			],
		),
		'',
		markdownTable(
			[
				'Catalog breakdown snapshot',
				'Tools',
				'Tools/List Bytes',
				'Schema Bytes',
				'InputSchema Bytes',
				'OutputSchema Bytes',
				'Max Plugin Bytes',
			],
			[
				[
					measurement.catalog.nativeCore.label,
					formatInt(measurement.catalog.nativeCore.toolCount),
					formatInt(measurement.catalog.nativeCore.toolsListBytes),
					formatInt(measurement.catalog.nativeCore.schemaBytes),
					formatInt(measurement.catalog.nativeCore.inputSchemaBytes),
					formatInt(measurement.catalog.nativeCore.outputSchemaBytes),
					formatInt(measurement.catalog.nativeCore.maxPluginBytes),
				],
				[
					measurement.catalog.swarmNative.label,
					formatInt(measurement.catalog.swarmNative.toolCount),
					formatInt(measurement.catalog.swarmNative.toolsListBytes),
					formatInt(measurement.catalog.swarmNative.schemaBytes),
					formatInt(measurement.catalog.swarmNative.inputSchemaBytes),
					formatInt(
						measurement.catalog.swarmNative.outputSchemaBytes,
					),
					formatInt(measurement.catalog.swarmNative.maxPluginBytes),
				],
			],
		),
		'',
		'Task context corpus: `cold start -> search.search -> docs.docs_list -> logs.tail`, measured as `mcp-vertex_vertex { domain: "core", action: "project_context" }` on the `swarm` preset under `managed`.',
		'',
		markdownTable(
			['Task context sample', 'Bytes', 'Est. Tokens'],
			measurement.taskContext.samples.map((sample) => [
				sample.label,
				formatInt(sample.bytes),
				formatInt(sample.estimatedTokens),
			]),
		),
		'',
		markdownTable(
			['Percentile', 'Bytes', 'Est. Tokens'],
			[
				[
					'p50',
					formatInt(measurement.taskContext.p50Bytes),
					formatInt(measurement.taskContext.p50EstimatedTokens),
				],
				[
					'p95',
					formatInt(measurement.taskContext.p95Bytes),
					formatInt(measurement.taskContext.p95EstimatedTokens),
				],
			],
		),
	].join('\n');
