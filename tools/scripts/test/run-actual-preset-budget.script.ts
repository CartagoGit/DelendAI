#!/usr/bin/env bun
import { TOKEN_BUDGETS, type IPresetKind } from '@mcp-vertex/core/public';

import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
	measureToolTextBytes,
	type IToolOwnerMetrics,
} from '../report/token-budget-report-lib';

type IMeasuredSurface = {
	readonly label: string;
	readonly value: number;
	readonly hard: number;
	readonly warning: number;
};

const formatInt = (value: number): string => value.toLocaleString('en-US');

const rawArgs = process.argv.slice(2).filter((value) => value.length > 0);

const readFlag = (prefix: string): string | undefined =>
	rawArgs.find((value) => value.startsWith(prefix))?.slice(prefix.length);

const hasFlag = (flag: string): boolean => rawArgs.includes(flag);

const parsePresetArgs = (): readonly IPresetKind[] => {
	if (rawArgs.length === 0) {
		return TOKEN_BUDGETS.governedPresetIds as readonly IPresetKind[];
	}
	const values = rawArgs.flatMap((value) =>
		value.startsWith('--preset=')
			? value.slice('--preset='.length).split(',')
			: value.startsWith('--surface=') || value === '--dynamic-client'
				? []
				: value.split(','),
	);
	return values.filter((value): value is IPresetKind =>
		(TOKEN_BUDGETS.governedPresetIds as readonly string[]).includes(value),
	);
};

const parseSurfaceMode = (): 'native' | 'adaptive' | 'compact' | undefined => {
	const value = readFlag('--surface=');
	if (value === 'native' || value === 'adaptive' || value === 'compact') {
		return value;
	}
	return undefined;
};

const measuredPresets = TOKEN_BUDGETS.presets as Readonly<
	Record<
		string,
		{
			readonly toolsList: {
				readonly hard: number;
				readonly warning: number;
				readonly marginalPluginHard?: number;
				readonly marginalPluginWarning?: number;
			};
			readonly overviewCompact?: {
				readonly hard: number;
				readonly warning: number;
			};
			readonly roundContext?: {
				readonly hard: number;
				readonly warning: number;
			};
		}
	>
>;

const topContributors = (
	rows: readonly IToolOwnerMetrics[],
): readonly IToolOwnerMetrics[] =>
	[...rows]
		.filter((row) => row.owner !== 'core')
		.sort((left, right) => right.toolsListBytes - left.toolsListBytes)
		.slice(0, 5);

/** Share of the preset's total owner bytes, not of `toolsListBytes` (the
 * whole-array JSON also carries `[`/`]`/commas — see TOKEN-BUDGETS.md). */
const shareOfPreset = (
	row: IToolOwnerMetrics,
	allRows: readonly IToolOwnerMetrics[],
): string => {
	const total = allRows.reduce((sum, entry) => sum + entry.toolsListBytes, 0);
	if (total === 0) return '0.0%';
	return `${((row.toolsListBytes / total) * 100).toFixed(1)}%`;
};

const printMeasuredSurface = (surface: IMeasuredSurface): void => {
	const status =
		surface.value > surface.hard
			? 'HARD BREACH'
			: surface.value > surface.warning
				? 'warning'
				: 'ok';
	console.log(
		`  ${surface.label}: ${formatInt(surface.value)} B (warning ${formatInt(surface.warning)} / hard ${formatInt(surface.hard)}) => ${status}`,
	);
};

const main = async (): Promise<number> => {
	const presets = parsePresetArgs();
	const surfaceMode = parseSurfaceMode() ?? 'native';
	const useDynamicClient = hasFlag('--static-client')
		? false
		: hasFlag('--dynamic-client') || surfaceMode === 'adaptive';
	const capabilities = useDynamicClient
		? DYNAMIC_SURFACE_CLIENT_CAPABILITIES
		: undefined;
	if (presets.length === 0) {
		console.error(
			`No valid preset requested. Allowed: ${TOKEN_BUDGETS.governedPresetIds.join(', ')}`,
		);
		process.exit(2);
	}
	console.log(
		'[tokens:gate] Measures serialized BYTES of tools/list per preset (the real MCP wire payload), not native LLM tokens. See docs/mcp-vertex/TOKEN-BUDGETS.md for the component breakdown and per-model token counts (real tokenizer encode where available, byte-ratio estimate elsewhere).',
	);
	const workspace = createTokenBudgetFixtureWorkspace();
	let breached = false;
	try {
		for (const presetId of presets) {
			const presetBudget = measuredPresets[presetId];
			if (presetBudget === undefined) {
				throw new Error(`Missing token budget for preset: ${presetId}`);
			}
			const connection = await connectTokenBudgetClient(workspace, {
				pluginList: asPresetId(presetId),
				preset: true,
				...(surfaceMode !== undefined ? { surfaceMode } : {}),
				...(capabilities !== undefined ? { capabilities } : {}),
			});
			try {
				const metrics = await listToolsMetrics(
					connection.client,
					connection.pluginIds,
				);
				console.log(
					`[${presetId}] ${metrics.toolCount} tools, ${formatInt(metrics.toolsListBytes)} B tools/list`,
				);
				printMeasuredSurface({
					label: 'tools/list',
					value: metrics.toolsListBytes,
					hard: presetBudget.toolsList.hard,
					warning: presetBudget.toolsList.warning,
				});
				if (metrics.toolsListBytes > presetBudget.toolsList.hard) {
					breached = true;
				}
				if (presetBudget.overviewCompact !== undefined) {
					const overviewCompact = await measureToolTextBytes(
						connection.client,
						'mcp-vertex_overview',
						{ compact: true },
					);
					printMeasuredSurface({
						label: 'overview compact',
						value: overviewCompact,
						hard: presetBudget.overviewCompact.hard,
						warning: presetBudget.overviewCompact.warning,
					});
					if (overviewCompact > presetBudget.overviewCompact.hard) {
						breached = true;
					}
				}
				if (presetBudget.roundContext !== undefined) {
					const roundContext = await measureToolTextBytes(
						connection.client,
						'mcp-vertex_proposals_round_context',
						{},
					);
					printMeasuredSurface({
						label: 'round context',
						value: roundContext,
						hard: presetBudget.roundContext.hard,
						warning: presetBudget.roundContext.warning,
					});
					if (roundContext > presetBudget.roundContext.hard) {
						breached = true;
					}
				}
				if (connection.loadErrors.length > 0) {
					breached = true;
					console.error('  load errors:');
					for (const entry of connection.loadErrors) {
						console.error(`    - ${entry}`);
					}
				}
				console.log(
					"  top contributors (share of this preset's bytes):",
				);
				for (const row of topContributors(metrics.ownerRows)) {
					console.log(
						`    - ${row.owner}: ${formatInt(row.toolsListBytes)} B (${row.toolCount} tools, ${shareOfPreset(row, metrics.ownerRows)})`,
					);
				}
			} finally {
				await connection.close();
			}
		}
	} finally {
		destroyTokenBudgetFixtureWorkspace(workspace);
	}
	if (breached) {
		return 1;
	}
	return 0;
};

const exitCode = await main().catch((error: unknown) => {
	console.error(
		`run-actual-preset-budget failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	return 1;
});

process.exit(exitCode);
