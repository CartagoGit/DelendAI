#!/usr/bin/env bun
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import {
	PRESET_CATALOG,
	TOKEN_BUDGETS,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { repoRoot } from '../lib/monorepo-paths';
import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	DYNAMIC_SURFACE_CLIENT_INFO,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
	measureToolTextBytes,
	seedAutoWorkReadyProposal,
	type IConnectedBudgetClient,
	type IToolListMetrics,
	type IToolOwnerMetrics,
} from './token-budget-report-lib';
import {
	estimateTokensFromBytes,
	TOKENIZER_MODELS,
} from './tokenizer-real.script';

interface IFixtureMeasurements {
	readonly overviewFull: number;
	readonly overviewCompact: number;
	readonly autoWorkIdle: number;
	readonly autoWorkWorkPlan: number;
	readonly agentCatalogCompact: number;
	readonly agentCatalogFull: number;
	readonly analyzeCompact: number;
	readonly planCompact: number;
	readonly search: number;
	readonly docsList: number;
	readonly roundContext: number;
	readonly logsTail: number;
}

interface IPresetDashboardRow {
	readonly presetId: string;
	readonly title: string;
	readonly surfaceMode: 'native' | 'adaptive';
	readonly source: 'tokens-gate' | 'dynamic-client';
	readonly pluginCount: number;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly maxPluginBytes: number;
	readonly overviewCompactBytes: number | null;
	readonly roundContextBytes: number | null;
	readonly loadErrors: readonly string[];
	readonly ownerRows: readonly IToolOwnerMetrics[];
}

// r00024 (PRESET-001): exported so `generate/preset-metadata.script.ts` reuses
// the exact same measurement `preset-metadata.generated.ts` is built from —
// no second, drift-prone measurement path.
export const DASHBOARD_SURFACES = [
	{
		surfaceMode: 'native',
		source: 'tokens-gate',
		clientInfo: undefined,
		capabilities: undefined,
	},
	{
		surfaceMode: 'adaptive',
		source: 'dynamic-client',
		clientInfo: DYNAMIC_SURFACE_CLIENT_INFO,
		capabilities: DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	},
] as const;

export const TOKEN_BUDGET_DASHBOARD_PATH = [
	'docs',
	'mcp-vertex',
	'TOKEN-BUDGETS.md',
] as const;

const GENERATED_MARKER = [
	'<!-- generated: token-budget-dashboard.script.ts -->',
	'<!-- generated — do not edit by hand -->',
].join('\n');

const formatInt = (value: number): string => value.toLocaleString('en-US');

const budgetStatus = (
	value: number,
	budget:
		| {
				readonly hard: number;
				readonly warning: number;
		  }
		| undefined,
): string => {
	if (budget === undefined) {
		return 'n/a';
	}
	if (value > budget.hard) {
		return `over hard (${formatInt(budget.hard)}B)`;
	}
	if (value > budget.warning) {
		return `over warning (${formatInt(budget.warning)}B)`;
	}
	return 'within hard';
};

const presetToolsBudget = (
	presetId: string,
):
	| {
			readonly hard: number;
			readonly warning: number;
			readonly marginalPluginHard?: number;
			readonly marginalPluginWarning?: number;
	  }
	| undefined => {
	const budgets = TOKEN_BUDGETS.presets as Readonly<
		Record<
			string,
			{
				readonly toolsList: {
					readonly hard: number;
					readonly warning: number;
					readonly marginalPluginHard?: number;
					readonly marginalPluginWarning?: number;
				};
			}
		>
	>;
	return budgets[presetId]?.toolsList;
};

const presetMarginalBudget = (
	presetId: string,
):
	| {
			readonly hard: number;
			readonly warning: number;
	  }
	| undefined => {
	const toolsListBudget = presetToolsBudget(presetId);
	if (toolsListBudget === undefined) return undefined;
	return {
		hard: toolsListBudget.marginalPluginHard ?? 0,
		warning: toolsListBudget.marginalPluginWarning ?? 0,
	};
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

const measureFixtureSurfaces = async (
	workspace: string,
): Promise<IFixtureMeasurements> => {
	const base = await connectTokenBudgetClient(workspace, {
		pluginList: TOKEN_BUDGETS.fixturePluginIds.join(','),
	});
	const catalog = await connectTokenBudgetClient(workspace, {
		pluginList: '',
	});
	const extra = await connectTokenBudgetClient(workspace, {
		pluginList: 'proposals,memory,search,docs,logs',
	});
	try {
		const overviewFull = await measureToolTextBytes(
			base.client,
			'mcp-vertex_overview',
			{},
		);
		const overviewCompact = await measureToolTextBytes(
			base.client,
			'mcp-vertex_overview',
			{ compact: true },
		);
		const autoWorkIdle = await measureToolTextBytes(
			base.client,
			'mcp-vertex_proposals_auto_work',
			{},
		);
		await seedAutoWorkReadyProposal(workspace, base.client);
		const autoWorkWorkPlan = await measureToolTextBytes(
			base.client,
			'mcp-vertex_proposals_auto_work',
			{},
		);
		const agentCatalogCompact = await measureToolTextBytes(
			catalog.client,
			'mcp-vertex_agent_catalog',
			{ mode: 'compact' },
		);
		const agentCatalogFull = await measureToolTextBytes(
			catalog.client,
			'mcp-vertex_agent_catalog',
			{ mode: 'full' },
		);
		const analyzeCompact = await measureToolTextBytes(
			base.client,
			'mcp-vertex_analyze_project',
			{},
		);
		const planCompact = await measureToolTextBytes(
			base.client,
			'mcp-vertex_plan_mcp_project',
			{},
		);
		await extra.client.callTool({
			name: 'mcp-vertex_search_search',
			arguments: { query: 'proposal', maxResults: 5, context: 0 },
		});
		await extra.client.callTool({
			name: 'mcp-vertex_docs_docs_list',
			arguments: { limit: 10 },
		});
		const search = await measureToolTextBytes(
			extra.client,
			'mcp-vertex_search_search',
			{ query: 'proposal', maxResults: 5, context: 0 },
		);
		const docsList = await measureToolTextBytes(
			extra.client,
			'mcp-vertex_docs_docs_list',
			{ limit: 10 },
		);
		const roundContext = await measureToolTextBytes(
			extra.client,
			'mcp-vertex_proposals_round_context',
			{},
		);
		const logsTail = await measureToolTextBytes(
			extra.client,
			'mcp-vertex_logs_tail',
			{ limit: 10 },
		);
		return {
			overviewFull,
			overviewCompact,
			autoWorkIdle,
			autoWorkWorkPlan,
			agentCatalogCompact,
			agentCatalogFull,
			analyzeCompact,
			planCompact,
			search,
			docsList,
			roundContext,
			logsTail,
		};
	} finally {
		await Promise.all([base.close(), catalog.close(), extra.close()]);
	}
};

const maybeMeasure = async (
	connection: IConnectedBudgetClient,
	toolName: string,
	args: Record<string, unknown>,
): Promise<number | null> => {
	const toolList = await connection.client.listTools();
	if (!toolList.tools.some((tool) => tool.name === toolName)) {
		return null;
	}
	return measureToolTextBytes(connection.client, toolName, args);
};

export const measurePresetDashboard = async (
	workspace: string,
	presetId: string,
	measurement: (typeof DASHBOARD_SURFACES)[number],
): Promise<IPresetDashboardRow> => {
	const preset = PRESET_CATALOG.find((entry) => entry.id === presetId);
	const connection = await connectTokenBudgetClient(workspace, {
		pluginList: asPresetId(presetId),
		preset: true,
		surfaceMode: measurement.surfaceMode,
		...(measurement.clientInfo !== undefined
			? { clientInfo: measurement.clientInfo }
			: {}),
		...(measurement.capabilities !== undefined
			? { capabilities: measurement.capabilities }
			: {}),
	});
	try {
		const metrics: IToolListMetrics = await listToolsMetrics(
			connection.client,
			connection.pluginIds,
		);
		const overviewCompactBytes = await maybeMeasure(
			connection,
			'mcp-vertex_overview',
			{ compact: true },
		);
		const roundContextBytes = await maybeMeasure(
			connection,
			'mcp-vertex_proposals_round_context',
			{},
		);
		return {
			presetId,
			title: preset?.title ?? presetId,
			surfaceMode: measurement.surfaceMode,
			source: measurement.source,
			pluginCount: connection.pluginIds.length,
			toolCount: metrics.toolCount,
			toolsListBytes: metrics.toolsListBytes,
			schemaBytes: metrics.schemaBytes,
			descriptionBytes: metrics.descriptionBytes,
			inputSchemaBytes: metrics.inputSchemaBytes,
			outputSchemaBytes: metrics.outputSchemaBytes,
			maxPluginBytes: metrics.maxPluginBytes,
			overviewCompactBytes,
			roundContextBytes,
			loadErrors: connection.loadErrors,
			ownerRows: metrics.ownerRows,
		};
	} finally {
		await connection.close();
	}
};

/**
 * c00135 — Per-surface columns. Pairs the `native` and `adaptive` rows of
 * the same preset side-by-side so a reader can compare without scanning
 * the dual rows of the main table. `deficits` are reported per surface,
 * never mixed.
 */
export interface IPerSurfaceColumn {
	readonly presetId: string;
	readonly adaptiveBytes: number | null;
	readonly adaptiveStatus: 'ok' | 'warning' | 'breach' | 'n/a';
	readonly nativeBytes: number | null;
	readonly nativeStatus: 'ok' | 'warning' | 'breach' | 'n/a';
	readonly adaptiveDeficit: string | null;
	readonly nativeDeficit: string | null;
}

const statusFromRow = (
	row: IPresetDashboardRow | undefined,
): 'ok' | 'warning' | 'breach' | 'n/a' => {
	if (row === undefined) return 'n/a';
	const budget = presetToolsBudget(row.presetId);
	if (budget === undefined) return 'n/a';
	if (row.toolsListBytes > budget.hard) return 'breach';
	if (row.toolsListBytes > budget.warning) return 'warning';
	return 'ok';
};

export const buildPerSurfaceColumns = (
	presetRows: readonly IPresetDashboardRow[],
): readonly IPerSurfaceColumn[] => {
	const byPreset = new Map<
		string,
		{ adaptive?: IPresetDashboardRow; native?: IPresetDashboardRow }
	>();
	for (const row of presetRows) {
		const entry = byPreset.get(row.presetId) ?? {};
		if (row.surfaceMode === 'adaptive') entry.adaptive = row;
		else if (row.surfaceMode === 'native') entry.native = row;
		byPreset.set(row.presetId, entry);
	}
	const out: IPerSurfaceColumn[] = [];
	for (const [presetId, entry] of byPreset) {
		const adaptiveRow = entry.adaptive;
		const nativeRow = entry.native;
		const adaptiveBudget = adaptiveRow
			? presetToolsBudget(adaptiveRow.presetId)
			: undefined;
		const nativeBudget = nativeRow
			? presetToolsBudget(nativeRow.presetId)
			: undefined;
		const adaptiveDeficit =
			adaptiveRow !== undefined &&
			adaptiveBudget !== undefined &&
			adaptiveRow.toolsListBytes > adaptiveBudget.hard
				? `breach: ${formatInt(adaptiveRow.toolsListBytes)}B > hard ${formatInt(adaptiveBudget.hard)}B`
				: null;
		const nativeDeficit =
			nativeRow !== undefined &&
			nativeBudget !== undefined &&
			nativeRow.toolsListBytes > nativeBudget.hard
				? `breach: ${formatInt(nativeRow.toolsListBytes)}B > hard ${formatInt(nativeBudget.hard)}B`
				: null;
		out.push({
			presetId,
			adaptiveBytes: adaptiveRow?.toolsListBytes ?? null,
			adaptiveStatus: statusFromRow(adaptiveRow),
			nativeBytes: nativeRow?.toolsListBytes ?? null,
			nativeStatus: statusFromRow(nativeRow),
			adaptiveDeficit,
			nativeDeficit,
		});
	}
	return out;
};

const renderGeneratedMarkdown = (
	generatedAt: string,
	fixture: IFixtureMeasurements,
	presetRows: readonly IPresetDashboardRow[],
): string => {
	// c00135: per-surface columns so the dashboard never mixes adaptive
	// bytes with native tokens. Each preset gets one row with two
	// measurements side-by-side, plus per-surface deficits.
	const perSurfaceColumns = buildPerSurfaceColumns(presetRows);
	const fixtureRows = [
		[
			'overview full',
			formatInt(fixture.overviewFull),
			String(estimateTokensFromBytes(fixture.overviewFull)),
			formatInt(TOKEN_BUDGETS.toolPayloads.overviewFull.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.overviewFull.hard),
			budgetStatus(
				fixture.overviewFull,
				TOKEN_BUDGETS.toolPayloads.overviewFull,
			),
		],
		[
			'overview compact',
			formatInt(fixture.overviewCompact),
			String(estimateTokensFromBytes(fixture.overviewCompact)),
			formatInt(TOKEN_BUDGETS.toolPayloads.overviewCompact.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.overviewCompact.hard),
			budgetStatus(
				fixture.overviewCompact,
				TOKEN_BUDGETS.toolPayloads.overviewCompact,
			),
		],
		[
			'auto_work idle',
			formatInt(fixture.autoWorkIdle),
			String(estimateTokensFromBytes(fixture.autoWorkIdle)),
			formatInt(TOKEN_BUDGETS.toolPayloads.autoWork.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.autoWork.hard),
			budgetStatus(
				fixture.autoWorkIdle,
				TOKEN_BUDGETS.toolPayloads.autoWork,
			),
		],
		[
			'auto_work work plan',
			formatInt(fixture.autoWorkWorkPlan),
			String(estimateTokensFromBytes(fixture.autoWorkWorkPlan)),
			formatInt(TOKEN_BUDGETS.toolPayloads.autoWork.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.autoWork.hard),
			budgetStatus(
				fixture.autoWorkWorkPlan,
				TOKEN_BUDGETS.toolPayloads.autoWork,
			),
		],
		[
			'agent_catalog compact',
			formatInt(fixture.agentCatalogCompact),
			String(estimateTokensFromBytes(fixture.agentCatalogCompact)),
			formatInt(TOKEN_BUDGETS.toolPayloads.agentCatalogCompact.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.agentCatalogCompact.hard),
			budgetStatus(
				fixture.agentCatalogCompact,
				TOKEN_BUDGETS.toolPayloads.agentCatalogCompact,
			),
		],
		[
			'agent_catalog full',
			formatInt(fixture.agentCatalogFull),
			String(estimateTokensFromBytes(fixture.agentCatalogFull)),
			formatInt(TOKEN_BUDGETS.toolPayloads.agentCatalogFull.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.agentCatalogFull.hard),
			budgetStatus(
				fixture.agentCatalogFull,
				TOKEN_BUDGETS.toolPayloads.agentCatalogFull,
			),
		],
		[
			'analyze_project {}',
			formatInt(fixture.analyzeCompact),
			String(estimateTokensFromBytes(fixture.analyzeCompact)),
			formatInt(TOKEN_BUDGETS.toolPayloads.analyzeCompact.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.analyzeCompact.hard),
			budgetStatus(
				fixture.analyzeCompact,
				TOKEN_BUDGETS.toolPayloads.analyzeCompact,
			),
		],
		[
			'plan_mcp_project {}',
			formatInt(fixture.planCompact),
			String(estimateTokensFromBytes(fixture.planCompact)),
			formatInt(TOKEN_BUDGETS.toolPayloads.planCompact.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.planCompact.hard),
			budgetStatus(
				fixture.planCompact,
				TOKEN_BUDGETS.toolPayloads.planCompact,
			),
		],
		[
			'search_search',
			formatInt(fixture.search),
			String(estimateTokensFromBytes(fixture.search)),
			formatInt(TOKEN_BUDGETS.toolPayloads.search.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.search.hard),
			budgetStatus(fixture.search, TOKEN_BUDGETS.toolPayloads.search),
		],
		[
			'docs_docs_list',
			formatInt(fixture.docsList),
			String(estimateTokensFromBytes(fixture.docsList)),
			formatInt(TOKEN_BUDGETS.toolPayloads.docsList.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.docsList.hard),
			budgetStatus(fixture.docsList, TOKEN_BUDGETS.toolPayloads.docsList),
		],
		[
			'proposals_round_context',
			formatInt(fixture.roundContext),
			String(estimateTokensFromBytes(fixture.roundContext)),
			formatInt(TOKEN_BUDGETS.toolPayloads.roundContext.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.roundContext.hard),
			budgetStatus(
				fixture.roundContext,
				TOKEN_BUDGETS.toolPayloads.roundContext,
			),
		],
		[
			'logs_tail',
			formatInt(fixture.logsTail),
			String(estimateTokensFromBytes(fixture.logsTail)),
			formatInt(TOKEN_BUDGETS.toolPayloads.logsTail.warning),
			formatInt(TOKEN_BUDGETS.toolPayloads.logsTail.hard),
			budgetStatus(fixture.logsTail, TOKEN_BUDGETS.toolPayloads.logsTail),
		],
	];

	const presetSummaryRows = presetRows.map((row) => [
		row.presetId,
		row.title,
		row.surfaceMode,
		row.source,
		String(row.pluginCount),
		String(row.toolCount),
		formatInt(row.toolsListBytes),
		String(estimateTokensFromBytes(row.toolsListBytes)),
		formatInt(row.schemaBytes),
		formatInt(row.descriptionBytes),
		formatInt(row.inputSchemaBytes),
		formatInt(row.outputSchemaBytes),
		formatInt(row.maxPluginBytes),
		row.overviewCompactBytes === null
			? 'n/a'
			: formatInt(row.overviewCompactBytes),
		row.roundContextBytes === null
			? 'n/a'
			: formatInt(row.roundContextBytes),
		budgetStatus(row.toolsListBytes, presetToolsBudget(row.presetId)),
		budgetStatus(row.maxPluginBytes, presetMarginalBudget(row.presetId)),
		row.loadErrors.length === 0 ? 'none' : row.loadErrors.join('<br>'),
	]);

	const pluginRows = presetRows.flatMap((row) =>
		row.ownerRows.map((ownerRow) => [
			row.presetId,
			row.surfaceMode,
			row.source,
			ownerRow.owner,
			String(ownerRow.toolCount),
			formatInt(ownerRow.toolsListBytes),
			formatInt(ownerRow.schemaBytes),
			formatInt(ownerRow.descriptionBytes),
			formatInt(ownerRow.inputSchemaBytes),
			formatInt(ownerRow.outputSchemaBytes),
		]),
	);

	const tokenizerSummaryRows = presetRows.map((row) => {
		const estimates = TOKENIZER_MODELS.map(() =>
			estimateTokensFromBytes(row.toolsListBytes),
		);
		return [
			row.presetId,
			row.surfaceMode,
			row.source,
			formatInt(row.toolsListBytes),
			String(estimates[0] ?? 0),
			String(estimates[1] ?? 0),
			String(estimates[2] ?? 0),
			'heuristic-4-bytes-per-token',
			'estimated fallback (no lightweight tokenizer dependency present)',
		];
	});

	const deficits = presetRows
		.filter((row) => {
			const budget = presetToolsBudget(row.presetId);
			return (
				row.source === 'tokens-gate' &&
				budget !== undefined &&
				row.toolsListBytes > budget.hard
			);
		})
		.map(
			(row) =>
				`- ${row.presetId} ${row.surfaceMode}/${row.source} tools/list = ${formatInt(row.toolsListBytes)}B, documented hard ceiling = ${formatInt(presetToolsBudget(row.presetId)?.hard ?? 0)}B. Derived from the same measurement semantics as tokens:gate; kept as-is per v00123 non-goal: report the deficit, do not auto-bump.`,
		);

	return [
		'# Token Budgets — generated dashboard',
		'',
		GENERATED_MARKER,
		'',
		`Generated at: ${generatedAt}`,
		'',
		'This file is generated from the same budget contract the e2e test imports: packages/core/src/lib/contracts/constants/token-budgets.constant.ts. Do not edit this markdown by hand; regenerate it with bun tools/scripts/report/token-budget-dashboard.script.ts.',
		'',
		'## Semantics',
		'',
		'- hard ceiling: the documented absolute limit for a governed surface. In the e2e gate it is the failing threshold; in this generated dashboard it is also used to flag real preset deficits that must not be auto-bumped.',
		'- warning ceiling: advisory threshold. Crossing it emits a warning or a report flag but does not fail by itself.',
		`- release ceiling: the relative release gate remains ${TOKEN_BUDGETS.toolPayloads.overviewFull.releaseRelativePercent}% against the persisted metrics baseline; this proposal does not replace that longitudinal guard.`,
		'- marginal plugin ceiling: max static tools/list bytes one plugin is allowed to contribute within a governed preset. This is tracked separately from the total preset ceiling.',
		'',
		'## Bump policy',
		'',
		`${TOKEN_BUDGETS.bumpPolicy.summary}`,
		'',
		...TOKEN_BUDGETS.bumpPolicy.requiredSteps.map(
			(step, index) => `${index + 1}. ${step}`,
		),
		'',
		'## Fixture-gated surfaces',
		'',
		'These are the bounded payloads the e2e spec governs directly today. They use the historical synthetic workspace fixture, so the hard ceilings stay stable until a future proposal deliberately tightens or re-baselines them.',
		'',
		markdownTable(
			['Surface', 'Bytes', 'Est. Tokens', 'Warning', 'Hard', 'Status'],
			fixtureRows,
		),
		'',
		'## Real preset dashboard',
		'',
		'This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface budget baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap surface). The managed default uses the same bootstrap exposure contract; the measurements remain intentionally separate from the native baseline.',
		'',
		markdownTable(
			[
				'Preset',
				'Title',
				'Surface Mode',
				'Source',
				'Plugins',
				'Tools',
				'Tools/List Bytes',
				'Est. Tokens',
				'Schema Bytes',
				'Description Bytes',
				'InputSchema Bytes',
				'OutputSchema Bytes',
				'Max Plugin Bytes',
				'Overview Compact',
				'Round Context',
				'Tools Status',
				'Marginal Status',
				'Load Errors',
			],
			presetSummaryRows,
		),
		'',
		'## Plugin marginal dashboard',
		'',
		markdownTable(
			[
				'Preset',
				'Surface Mode',
				'Source',
				'Owner',
				'Tools',
				'Tools/List Bytes',
				'Schema Bytes',
				'Description Bytes',
				'InputSchema Bytes',
				'OutputSchema Bytes',
			],
			pluginRows,
		),
		'',
		'## CHECK-007 — tokenizer cost by preset',
		'',
		'The repo has no lightweight LLM tokenizer dependency installed today. This report therefore uses an explicit fallback estimator of 4 bytes/token, published as an estimate rather than pretending to be an exact tokenizer. The script lives in tools/scripts/report/tokenizer-real.script.ts so the fallback can be replaced by a real tokenizer later without changing the dashboard contract.',
		'',
		markdownTable(
			[
				'Preset',
				'Surface Mode',
				'Source',
				'Tools/List Bytes',
				`${TOKENIZER_MODELS[0]} Tokens`,
				`${TOKENIZER_MODELS[1]} Tokens`,
				`${TOKENIZER_MODELS[2]} Tokens`,
				'Estimator',
				'Notes',
			],
			tokenizerSummaryRows,
		),
		'',
		'## Documented deficits (kept, not auto-bumped)',
		'',
		...(deficits.length === 0 ? ['- none'] : deficits),
		'',
		'## Per-surface columns (c00135)',
		'',
		'Each preset is reported with its adaptive (output-schema bytes via the dynamic client) and native (estimated prompt tokens via the tokens gate) measurements side-by-side. Status reflects the surface-specific hard ceiling; mixing the two columns is intentionally avoided.',
		'',
		markdownTable(
			[
				'Preset',
				'Adaptive Bytes',
				'Adaptive Status',
				'Adaptive Deficit',
				'Native Bytes',
				'Native Status',
				'Native Deficit',
			],
			perSurfaceColumns.map((col) => [
				col.presetId,
				col.adaptiveBytes === null
					? 'n/a'
					: formatInt(col.adaptiveBytes),
				col.adaptiveStatus,
				col.adaptiveDeficit ?? '—',
				col.nativeBytes === null ? 'n/a' : formatInt(col.nativeBytes),
				col.nativeStatus,
				col.nativeDeficit ?? '—',
			]),
		),
		'',
		'## Reproduce',
		'',
		'```bash',
		'bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts',
		'bun tools/scripts/report/token-budget-dashboard.script.ts',
		'bun tools/scripts/report/tokenizer-real.script.ts',
		'```',
	].join('\n');
};

export const buildTokenBudgetDashboardMarkdown = async (
	input: { readonly generatedAt?: string } = {},
): Promise<string> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	try {
		const fixture = await measureFixtureSurfaces(workspace);
		const presetRows: IPresetDashboardRow[] = [];
		for (const presetId of TOKEN_BUDGETS.dashboardPresetIds) {
			for (const measurement of DASHBOARD_SURFACES) {
				presetRows.push(
					await measurePresetDashboard(
						workspace,
						presetId,
						measurement,
					),
				);
			}
		}
		const markdown = `${renderGeneratedMarkdown(
			input.generatedAt ?? new Date().toISOString(),
			fixture,
			presetRows,
		)}\n`;
		return markdown;
	} finally {
		destroyTokenBudgetFixtureWorkspace(workspace);
	}
};

export const generateTokenBudgetDashboard = async (): Promise<{
	readonly markdown: string;
	readonly outputPath: string;
}> => {
	const outputPath = join(repoRoot(), ...TOKEN_BUDGET_DASHBOARD_PATH);
	const existing = await readFile(outputPath, 'utf8').catch(() => null);
	const fresh = await buildTokenBudgetDashboardMarkdown();
	const normalizeGeneratedAt = (text: string): string =>
		text.replace(/^Generated at: .*$/mu, 'Generated at: <normalized>');
	const existingGeneratedAt = existing?.match(/^Generated at: (.*?)$/mu)?.[1];
	// The timestamp is provenance, not content. Preserve it when the measured
	// dashboard is unchanged so a routine regeneration does not create a noisy
	// commit every time the generator runs.
	const markdown =
		existing !== null &&
		existingGeneratedAt !== undefined &&
		normalizeGeneratedAt(existing) === normalizeGeneratedAt(fresh)
			? fresh.replace(
					/^Generated at: .*$/mu,
					`Generated at: ${existingGeneratedAt}`,
				)
			: fresh;
	await withFileMutex(outputPath, async () => {
		await writeFileAtomic(outputPath, markdown);
	});
	return { markdown, outputPath };
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const exitCode = await generateTokenBudgetDashboard()
		.then((result) => {
			console.log(`wrote ${result.outputPath}`);
			return 0;
		})
		.catch((error: unknown) => {
			console.error(
				`token-budget-dashboard failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return 1;
		});

	process.exit(exitCode);
}
