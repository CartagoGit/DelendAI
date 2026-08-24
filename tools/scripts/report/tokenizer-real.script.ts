#!/usr/bin/env bun
import { TOKEN_BUDGETS } from '@mcp-vertex/core/public';

import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
	type IToolListMetrics,
} from './token-budget-report-lib';

export interface ITokenizerModelEstimate {
	readonly model: string;
	readonly estimatedTokens: number;
	readonly approximate: true;
	readonly estimator: 'heuristic-4-bytes-per-token';
}

export interface ITokenizerPresetMeasurement {
	readonly presetId: string;
	readonly toolsListBytes: number;
	readonly toolCount: number;
	readonly estimates: readonly ITokenizerModelEstimate[];
}

export const TOKENIZER_MODELS = [
	'gpt-5.4',
	'claude-sonnet-4',
	'gemini-2.5-pro',
] as const;

export const estimateTokensFromBytes = (bytes: number): number =>
	Math.ceil(bytes / TOKEN_BUDGETS.bytesPerEstimatedToken);

const buildModelEstimates = (
	bytes: number,
): readonly ITokenizerModelEstimate[] =>
	TOKENIZER_MODELS.map((model) => ({
		model,
		estimatedTokens: estimateTokensFromBytes(bytes),
		approximate: true,
		estimator: 'heuristic-4-bytes-per-token',
	}));

export const measurePresetTokenizerCosts = async (
	presetIds: readonly string[] = TOKEN_BUDGETS.dashboardPresetIds,
): Promise<readonly ITokenizerPresetMeasurement[]> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	try {
		const rows: ITokenizerPresetMeasurement[] = [];
		for (const presetId of presetIds) {
			const connection = await connectTokenBudgetClient(workspace, {
				pluginList: asPresetId(presetId),
				preset: true,
			});
			try {
				const metrics: IToolListMetrics = await listToolsMetrics(
					connection.client,
					connection.pluginIds,
				);
				rows.push({
					presetId,
					toolsListBytes: metrics.toolsListBytes,
					toolCount: metrics.toolCount,
					estimates: buildModelEstimates(metrics.toolsListBytes),
				});
			} finally {
				await connection.close();
			}
		}
		return rows;
	} finally {
		destroyTokenBudgetFixtureWorkspace(workspace);
	}
};

const renderCliTable = (
	rows: readonly ITokenizerPresetMeasurement[],
): string => {
	const header = [
		'Preset',
		'Tools/List Bytes',
		'Estimated Tokens',
		'Estimator',
	].join('\t');
	const body = rows.map((row) => {
		const primary = row.estimates[0];
		return [
			row.presetId,
			String(row.toolsListBytes),
			String(primary?.estimatedTokens ?? 0),
			primary?.estimator ?? 'unknown',
		].join('\t');
	});
	return [header, ...body].join('\n');
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	measurePresetTokenizerCosts()
		.then((rows) => {
			console.log(renderCliTable(rows));
		})
		.catch((error: unknown) => {
			console.error(
				`tokenizer-real failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		});
}
