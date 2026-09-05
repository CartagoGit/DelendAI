#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	createPluginMetrics,
	hydrateKpis,
	PRESET_CATALOG,
	TOKEN_BUDGETS,
	withFileMutex,
	writeFileAtomic,
	type IGovernedToolsListBudget,
	type IMcpToolSurfaceMode,
	type ITokenBudgetSurface,
} from '@delendai/core/public';

import { repoRoot } from '../lib/monorepo-paths';
import {
	measureCatalogAndTaskContextCost,
	renderCatalogAndTaskContextMarkdown,
} from '../measure/catalog-task-context-cost';
import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
	DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	DYNAMIC_SURFACE_CLIENT_INFO,
	listToolsMetrics,
	measureToolTextBytes,
	seedAutoWorkReadyProposal,
	toolsListJsonText,
	type IConnectedBudgetClient,
	type IToolBreakdownRow,
	type IToolListEntry,
	type IToolListMetrics,
	type IToolOwnerMetrics,
} from './token-budget-report-lib';
import {
	buildTokenizerEstimates,
	estimateTokensFromBytes,
	TOKENIZER_MODELS,
	type ITokenizerModelEstimate,
} from './tokenizer-real.script';

interface IFixtureMeasurements {
	readonly overviewFull: number;
	readonly overviewCompact: number;
	/** x00296 S2 (AUD-B06): `overview` measured under `native` — see
	 * `overviewFullNative`/`overviewCompactNative` in `token-budgets.constant.ts`. */
	readonly overviewFullNative: number;
	readonly overviewCompactNative: number;
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
	/** Surface used to collect the measurement, not the default runtime. */
	readonly surfaceMode: 'native' | 'adaptive';
	/** Surface used by ordinary DelendAI hosts for this measurement. */
	readonly runtimeSurface: 'managed';
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
	readonly toolBreakdowns: readonly IToolBreakdownRow[];
	readonly tokenizerEstimates: readonly ITokenizerModelEstimate[];
}

// r00024 (PRESET-001): exported so `generate/preset-metadata.script.ts` reuses
// the exact same measurement `preset-metadata.generated.ts` is built from —
// no second, drift-prone measurement path.
export const DASHBOARD_SURFACES = [
	{
		surfaceMode: 'native',
		runtimeSurface: 'managed',
		source: 'tokens-gate',
		clientInfo: undefined,
		capabilities: undefined,
	},
	{
		surfaceMode: 'adaptive',
		runtimeSurface: 'managed',
		source: 'dynamic-client',
		clientInfo: DYNAMIC_SURFACE_CLIENT_INFO,
		capabilities: DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	},
] as const;

export const TOKEN_BUDGET_DASHBOARD_PATH = [
	'docs',
	'delendai',
	'TOKEN-BUDGETS.md',
] as const;

const ACTIVATION_KPIS_PATH = ['.vscode', 'delendai', 'kpis.json'] as const;

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
): IGovernedToolsListBudget | undefined => {
	const budgets = TOKEN_BUDGETS.presets as Readonly<
		Record<string, { readonly toolsList: IGovernedToolsListBudget }>
	>;
	return budgets[presetId]?.toolsList;
};

/**
 * AUD-B02/x00283: `marginalPluginHard`/`marginalPluginWarning` are
 * REQUIRED on `IGovernedToolsListBudget` (the compiler enforces every
 * governed preset declares them), so this can no longer silently default
 * to `?? 0` — that default is what produced the "over hard (0B)"
 * permanent false alarm for minimal/standard/full/vertex. A preset
 * outside `TOKEN_BUDGETS.presets` (e.g. the non-governed dashboard-only
 * presets like `web-app`) still renders `n/a` via the `undefined` return
 * here, which is the one legitimately optional case.
 */
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
	if (
		typeof toolsListBudget.marginalPluginHard !== 'number' ||
		!Number.isFinite(toolsListBudget.marginalPluginHard) ||
		toolsListBudget.marginalPluginHard <= 0 ||
		typeof toolsListBudget.marginalPluginWarning !== 'number' ||
		!Number.isFinite(toolsListBudget.marginalPluginWarning) ||
		toolsListBudget.marginalPluginWarning <= 0
	) {
		return undefined;
	}
	return {
		hard: toolsListBudget.marginalPluginHard,
		warning: toolsListBudget.marginalPluginWarning,
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

const renderActivationKpisUnavailable = (reason: string): string =>
	[
		'## Activation KPIs',
		'',
		`Source snapshot: ${ACTIVATION_KPIS_PATH.join('/')}`,
		'',
		reason,
		'',
		'This dashboard can only render a previously persisted local snapshot. Runtime collection and disk writes must be performed by the caller or host integration that owns the session lifecycle.',
	].join('\n');

const loadActivationKpisMarkdown = async (): Promise<string> => {
	const inputPath = join(repoRoot(), ...ACTIVATION_KPIS_PATH);
	const jsonText = await readFile(inputPath, 'utf8').catch(() => null);
	if (jsonText === null) {
		return renderActivationKpisUnavailable(
			`No local activation KPI snapshot was found at ${ACTIVATION_KPIS_PATH.join('/')}.`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText) as unknown;
	} catch (error: unknown) {
		return renderActivationKpisUnavailable(
			`The snapshot at ${ACTIVATION_KPIS_PATH.join('/')} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
	const kpis = hydrateKpis(parsed);
	if (kpis.aggregate().sessionCount === 0) {
		return renderActivationKpisUnavailable(
			`The snapshot at ${ACTIVATION_KPIS_PATH.join('/')} did not contain any valid activation KPI sessions.`,
		);
	}
	return kpis
		.formatForDashboard()
		.replace(
			'## Activation KPIs',
			[
				'## Activation KPIs',
				'',
				`Source snapshot: ${ACTIVATION_KPIS_PATH.join('/')}`,
			].join('\n'),
		);
};

/**
 * x00296 S1 (AUD-B06): every connection below now declares its surface
 * EXPLICITLY (`surfaceMode`) instead of inheriting whatever
 * `decideSurfaceModeFromCapabilities` infers for a client that declares no
 * capabilities. That inference silently flipped from `managed` to `native`
 * when `x00285` fixed AUD-C01, which is what made `overview full`/`overview
 * compact` read "over hard" against ceilings calibrated for the smaller
 * `managed` bootstrap listing.
 *
 * The explicit mode picked per row is not uniform — it is the surface each
 * tool actually measures a REAL payload for, verified empirically (not
 * assumed): `overview` is part of every surface's always-on bootstrap
 * listing, so it alone gets a dedicated `managed` connection. Every other
 * fixture tool (`auto_work`, `agent_catalog`, `analyze_project`,
 * `plan_mcp_project`, `search`, `docs`, `round_context`, `logs_tail`) is
 * DISABLED for direct by-name invocation under `managed` (the SDK returns
 * `Tool <name> disabled` — by design, `managed` only exposes those tools
 * through the `vertex` router, per the `IMcpToolSurfaceMode` doc). Forcing
 * `managed` on those rows would not "restore" their ceiling comparison; it
 * would silently replace every one of them with a fixed-size error-stub
 * measurement that trivially passes any ceiling forever. Declaring `native`
 * for them instead measures the same real payload they already measured
 * before this fix (the fixture's implicit default), which is also the
 * surface their ceilings were calibrated against — see the historical
 * `overviewFull` ceiling comment and the pre-AUD-C01 measurements captured
 * in `docs/delendai/proposals/ready/fixes/x00296-*.md`.
 */
const measureFixtureSurfaces = async (
	workspace: string,
): Promise<IFixtureMeasurements> => {
	const overviewSurface = await connectTokenBudgetClient(workspace, {
		pluginList: TOKEN_BUDGETS.fixturePluginIds.join(','),
		surfaceMode: 'managed',
	});
	const base = await connectTokenBudgetClient(workspace, {
		pluginList: TOKEN_BUDGETS.fixturePluginIds.join(','),
		surfaceMode: 'native',
	});
	const catalog = await connectTokenBudgetClient(workspace, {
		pluginList: '',
		surfaceMode: 'native',
	});
	const extra = await connectTokenBudgetClient(workspace, {
		pluginList: 'proposals,memory,search,docs,logs',
		surfaceMode: 'native',
	});
	const logs = await connectTokenBudgetClient(workspace, {
		pluginList: 'logs',
		surfaceMode: 'native',
	});
	try {
		const logsTail = await measureToolTextBytes(
			logs.client,
			'delendai_logs_tail',
			{ limit: 1, kindFilter: 'token-budget-fixture-absent' },
		);
		const overviewFull = await measureToolTextBytes(
			overviewSurface.client,
			'delendai_overview',
			{},
		);
		const overviewCompact = await measureToolTextBytes(
			overviewSurface.client,
			'delendai_overview',
			{ compact: true },
		);
		// x00296 S2 (AUD-B06): the `native` surface counterpart, measured
		// on the already-`native` `base` connection (it is also used below
		// for `auto_work`/`analyze_project`/`plan_mcp_project`).
		const overviewFullNative = await measureToolTextBytes(
			base.client,
			'delendai_overview',
			{},
		);
		const overviewCompactNative = await measureToolTextBytes(
			base.client,
			'delendai_overview',
			{ compact: true },
		);
		const autoWorkIdle = await measureToolTextBytes(
			base.client,
			'delendai_proposals_auto_work',
			{},
		);
		await seedAutoWorkReadyProposal(workspace, base.client);
		const autoWorkWorkPlan = await measureToolTextBytes(
			base.client,
			'delendai_proposals_auto_work',
			{},
		);
		const agentCatalogCompact = await measureToolTextBytes(
			catalog.client,
			'delendai_agent_catalog',
			{ mode: 'compact' },
		);
		const agentCatalogFull = await measureToolTextBytes(
			catalog.client,
			'delendai_agent_catalog',
			{ mode: 'full' },
		);
		const analyzeCompact = await measureToolTextBytes(
			base.client,
			'delendai_analyze_project',
			{},
		);
		const planCompact = await measureToolTextBytes(
			base.client,
			'delendai_plan_mcp_project',
			{},
		);
		await extra.client.callTool({
			name: 'delendai_search_search',
			arguments: { query: 'proposal', maxResults: 5, context: 0 },
		});
		await extra.client.callTool({
			name: 'delendai_docs_docs_list',
			arguments: { limit: 10 },
		});
		const search = await measureToolTextBytes(
			extra.client,
			'delendai_search_search',
			{ query: 'proposal', maxResults: 5, context: 0 },
		);
		const docsList = await measureToolTextBytes(
			extra.client,
			'delendai_docs_docs_list',
			{ limit: 10 },
		);
		const roundContext = await measureToolTextBytes(
			extra.client,
			'delendai_proposals_round_context',
			{},
		);
		return {
			overviewFull,
			overviewCompact,
			overviewFullNative,
			overviewCompactNative,
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
		await Promise.all([
			overviewSurface.close(),
			base.close(),
			catalog.close(),
			extra.close(),
			logs.close(),
		]);
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
		const toolList = await connection.client.listTools();
		const tools = toolList.tools as readonly IToolListEntry[];
		const metrics: IToolListMetrics = await listToolsMetrics(
			connection.client,
			connection.pluginIds,
		);
		const overviewCompactBytes = await maybeMeasure(
			connection,
			'delendai_overview',
			{ compact: true },
		);
		const roundContextBytes = await maybeMeasure(
			connection,
			'delendai_proposals_round_context',
			{},
		);
		return {
			presetId,
			title: preset?.title ?? presetId,
			surfaceMode: measurement.surfaceMode,
			runtimeSurface: measurement.runtimeSurface,
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
			toolBreakdowns: metrics.toolBreakdowns,
			tokenizerEstimates: buildTokenizerEstimates(
				toolsListJsonText(tools),
			),
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
	fixture: IFixtureMeasurements,
	presetRows: readonly IPresetDashboardRow[],
	taskContextAddendum: string,
	activationKpisMarkdown: string,
): string => {
	// c00135: per-surface columns so the dashboard never mixes adaptive
	// bytes with native tokens. Each preset gets one row with two
	// measurements side-by-side, plus per-surface deficits.
	const perSurfaceColumns = buildPerSurfaceColumns(presetRows);
	// x00296 S1 (AUD-B06): every fixture-gated row now names the surface it
	// measured — see the module doc on `measureFixtureSurfaces` for why
	// `overview` is the only row measured under `managed` while the rest
	// stay `native`.
	const fixtureRowSpecs: ReadonlyArray<{
		readonly label: string;
		readonly surfaceMode: IMcpToolSurfaceMode;
		readonly bytes: number;
		readonly budget: ITokenBudgetSurface;
	}> = [
		{
			label: 'overview full',
			surfaceMode: 'managed',
			bytes: fixture.overviewFull,
			budget: TOKEN_BUDGETS.toolPayloads.overviewFull,
		},
		{
			label: 'overview compact',
			surfaceMode: 'managed',
			bytes: fixture.overviewCompact,
			budget: TOKEN_BUDGETS.toolPayloads.overviewCompact,
		},
		{
			label: 'overview full (native)',
			surfaceMode: 'native',
			bytes: fixture.overviewFullNative,
			budget: TOKEN_BUDGETS.toolPayloads.overviewFullNative,
		},
		{
			label: 'overview compact (native)',
			surfaceMode: 'native',
			bytes: fixture.overviewCompactNative,
			budget: TOKEN_BUDGETS.toolPayloads.overviewCompactNative,
		},
		{
			label: 'auto_work idle',
			surfaceMode: 'native',
			bytes: fixture.autoWorkIdle,
			budget: TOKEN_BUDGETS.toolPayloads.autoWork,
		},
		{
			label: 'auto_work work plan',
			surfaceMode: 'native',
			bytes: fixture.autoWorkWorkPlan,
			budget: TOKEN_BUDGETS.toolPayloads.autoWork,
		},
		{
			label: 'agent_catalog compact',
			surfaceMode: 'native',
			bytes: fixture.agentCatalogCompact,
			budget: TOKEN_BUDGETS.toolPayloads.agentCatalogCompact,
		},
		{
			label: 'agent_catalog full',
			surfaceMode: 'native',
			bytes: fixture.agentCatalogFull,
			budget: TOKEN_BUDGETS.toolPayloads.agentCatalogFull,
		},
		{
			label: 'analyze_project {}',
			surfaceMode: 'native',
			bytes: fixture.analyzeCompact,
			budget: TOKEN_BUDGETS.toolPayloads.analyzeCompact,
		},
		{
			label: 'plan_mcp_project {}',
			surfaceMode: 'native',
			bytes: fixture.planCompact,
			budget: TOKEN_BUDGETS.toolPayloads.planCompact,
		},
		{
			label: 'search_search',
			surfaceMode: 'native',
			bytes: fixture.search,
			budget: TOKEN_BUDGETS.toolPayloads.search,
		},
		{
			label: 'docs_docs_list',
			surfaceMode: 'native',
			bytes: fixture.docsList,
			budget: TOKEN_BUDGETS.toolPayloads.docsList,
		},
		{
			label: 'proposals_round_context',
			surfaceMode: 'native',
			bytes: fixture.roundContext,
			budget: TOKEN_BUDGETS.toolPayloads.roundContext,
		},
		{
			label: 'logs_tail',
			surfaceMode: 'native',
			bytes: fixture.logsTail,
			budget: TOKEN_BUDGETS.toolPayloads.logsTail,
		},
	];
	const fixtureRows = fixtureRowSpecs.map((spec) => [
		spec.label,
		spec.surfaceMode,
		formatInt(spec.bytes),
		String(estimateTokensFromBytes(spec.bytes)),
		formatInt(spec.budget.warning),
		formatInt(spec.budget.hard),
		budgetStatus(spec.bytes, spec.budget),
	]);

	const presetSummaryRows = presetRows.map((row) => [
		row.presetId,
		row.title,
		row.surfaceMode,
		row.runtimeSurface,
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

	// Share of preset is computed against the sum of the OWNER rows' own
	// entry-level bytes (not the whole-array `toolsListBytes`, which also
	// carries the array's `[`/`]`/commas) so shares sum to exactly 100%.
	const pluginRows = presetRows.flatMap((row) => {
		const presetOwnerTotal = row.ownerRows.reduce(
			(sum, ownerRow) => sum + ownerRow.toolsListBytes,
			0,
		);
		return row.ownerRows.map((ownerRow) => [
			row.presetId,
			row.surfaceMode,
			row.runtimeSurface,
			row.source,
			ownerRow.owner,
			String(ownerRow.toolCount),
			formatInt(ownerRow.toolsListBytes),
			formatInt(ownerRow.descriptionBytes),
			formatInt(ownerRow.inputSchemaBytes),
			formatInt(ownerRow.outputSchemaBytes),
			formatInt(ownerRow.annotationsBytes),
			formatInt(ownerRow.otherFieldBytes),
			formatInt(ownerRow.envelopeBytes),
			presetOwnerTotal === 0
				? '0.0%'
				: `${((ownerRow.toolsListBytes / presetOwnerTotal) * 100).toFixed(1)}%`,
		]);
	});

	const tokenizerSummaryRows = presetRows.map((row) => [
		row.presetId,
		row.surfaceMode,
		row.runtimeSurface,
		row.source,
		formatInt(row.toolsListBytes),
		...row.tokenizerEstimates.map((estimate) =>
			String(estimate.tokenCount),
		),
		row.tokenizerEstimates
			.map((estimate) => estimate.confidence)
			.join(', '),
	]);

	const topToolsRow = presetRows.find(
		(row) => row.presetId === 'vertex' && row.surfaceMode === 'native',
	);
	const topToolsRows = [...(topToolsRow?.toolBreakdowns ?? [])]
		.sort((left, right) => right.totalBytes - left.totalBytes)
		.slice(0, 20)
		.map((tool) => [
			tool.name,
			tool.owner,
			formatInt(tool.totalBytes),
			formatInt(tool.nameBytes),
			formatInt(tool.descriptionBytes),
			formatInt(tool.inputSchemaBytes),
			formatInt(tool.outputSchemaBytes),
			formatInt(tool.annotationsBytes),
			formatInt(tool.otherFieldBytes),
			formatInt(tool.envelopeBytes),
		]);

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
		'Generated from the current repository measurements; timestamps are intentionally omitted for deterministic diffs.',
		'',
		'This file is generated from the same budget contract the e2e test imports: packages/core/src/lib/contracts/constants/token-budgets.constant.ts. Do not edit this markdown by hand; regenerate it with bun tools/scripts/report/token-budget-dashboard.script.ts.',
		'',
		'## What this gate actually measures',
		'',
		'`tokens:gate` and this dashboard measure serialized BYTES of the tools/list JSON payload (`toolsListBytes` / `measureToolTextBytes`) — the wire size the MCP client receives, not native LLM tokens. Bytes and tokens correlate but are not interchangeable: bytes-per-token varies across prose descriptions, JSON schemas, and identifiers, so a byte delta does not reliably predict a token delta. The "Component breakdown" and "Top tools by bytes" sections below break every measurement down into name/description/inputSchema/outputSchema/annotations/envelope bytes — the parts that make up that wire size. The "CHECK-007" section separately reports token counts per model, each labelled with how much to trust it (real tokenizer encode vs. byte-ratio estimate) — see that section for what is measured versus estimated.',
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
			[
				'Surface',
				'Measurement Surface',
				'Bytes',
				'Est. Tokens',
				'Warning',
				'Hard',
				'Status',
			],
			fixtureRows,
		),
		'',
		taskContextAddendum,
		'',
		'## Real preset dashboard',
		'',
		'This dashboard measures the real preset assemblies through the actual plugin loader. Each preset is reported twice: `native / tokens-gate` (the full-surface measurement baseline) and explicit `adaptive / dynamic-client` (the compact bootstrap measurement). `Runtime Surface` is shown separately because ordinary DelendAI execution defaults to `managed`; `native` here does not mean that the server is running native.',
		'',
		markdownTable(
			[
				'Preset',
				'Title',
				'Measurement Surface',
				'Runtime Surface',
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
		'## Plugin marginal dashboard — component breakdown by owner',
		'',
		"`Tools/List Bytes` per owner is the sum of each tool's own serialized entry (`JSON.stringify({name, description, inputSchema, outputSchema, annotations})`), decomposed into the fields that make it up. `Envelope Bytes` is JSON punctuation and key labels — derived by subtraction, so every row's named-field columns plus Envelope Bytes sum exactly to Tools/List Bytes. `Share of Preset` is this owner's bytes divided by the sum of all owners' bytes in that preset row (not divided by the whole-array `Tools/List Bytes` on the preset-summary table above, which also carries the array's own brackets/commas) — shares always sum to 100%.",
		'',
		markdownTable(
			[
				'Preset',
				'Measurement Surface',
				'Runtime Surface',
				'Source',
				'Owner',
				'Tools',
				'Tools/List Bytes',
				'Description Bytes',
				'InputSchema Bytes',
				'OutputSchema Bytes',
				'Annotations Bytes',
				'Other Bytes',
				'Envelope Bytes',
				'Share of Preset',
			],
			pluginRows,
		),
		'',
		'## Top tools by bytes (vertex preset, native surface)',
		'',
		'The 20 individual tools that cost the most tools/list bytes in the largest governed preset, with the same component breakdown as the owner table above. This is where "concentration" becomes concrete: a handful of tools account for a disproportionate share of the whole surface.',
		'',
		markdownTable(
			[
				'Tool',
				'Owner',
				'Total Bytes',
				'Name Bytes',
				'Description Bytes',
				'InputSchema Bytes',
				'OutputSchema Bytes',
				'Annotations Bytes',
				'Other Bytes',
				'Envelope Bytes',
			],
			topToolsRows,
		),
		'',
		'## CHECK-007 — tokenizer cost by preset',
		'',
		"This gate (`tokens:gate` / `tokens:dashboard:generate`) measures serialized BYTES of the tools/list JSON payload, not native LLM tokens — bytes-per-token varies enough across prose descriptions, JSON schemas, and identifiers that a byte count cannot substitute for a real token count. The table below reports both, with an explicit confidence label per model: `measured-real-bpe` is a real encode with the model's own published tokenizer (gpt-tokenizer for gpt-5.4); `measured-legacy-bpe` is a real BPE encode but on a vocabulary the vendor published for an older model generation (Anthropic has not published an offline tokenizer for Claude Sonnet 4, so @anthropic-ai/tokenizer's pre-Claude-3 vocabulary is used as the closest available real encoder); `estimated-byte-ratio` is bytes / 4, used only where no offline tokenizer package exists (Gemini). See tools/scripts/report/tokenizer-real.script.ts for the profile definitions.",
		'',
		markdownTable(
			[
				'Preset',
				'Measurement Surface',
				'Runtime Surface',
				'Source',
				'Tools/List Bytes',
				`${TOKENIZER_MODELS[0]} Tokens`,
				`${TOKENIZER_MODELS[1]} Tokens`,
				`${TOKENIZER_MODELS[2]} Tokens`,
				'Confidence (per model, in order above)',
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
		'Metrics for plugin lifecycle transitions (c00134). Counters are ',
		'process-local aggregates; the router emits them on each transition ',
		'and the dashboard projects the snapshot. All values below start at ',
		'zero in a fresh process and accumulate over the host run.',
		'',
		createPluginMetrics().formatForDashboard(),
		'',
		activationKpisMarkdown,
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
	_input: { readonly generatedAt?: string } = {},
): Promise<string> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	try {
		const [fixture, taskContextMeasurement] = await Promise.all([
			measureFixtureSurfaces(workspace),
			measureCatalogAndTaskContextCost(),
		]);
		const taskContextAddendum = renderCatalogAndTaskContextMarkdown(
			taskContextMeasurement,
		);
		const activationKpisMarkdown = await loadActivationKpisMarkdown();
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
			fixture,
			presetRows,
			taskContextAddendum,
			activationKpisMarkdown,
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
	const fresh = await buildTokenBudgetDashboardMarkdown();
	await withFileMutex(outputPath, async () => {
		await writeFileAtomic(outputPath, fresh);
	});
	return { markdown: fresh, outputPath };
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
