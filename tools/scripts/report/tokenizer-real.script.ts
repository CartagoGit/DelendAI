#!/usr/bin/env bun
import { countTokens as countAnthropicLegacyTokens } from '@anthropic-ai/tokenizer';
import { countTokens as countGpt54Tokens } from 'gpt-tokenizer/model/gpt-5.4';

import { TOKEN_BUDGETS } from '@delendai/core/public';

import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
	toolsListJsonText,
	type IToolListEntry,
} from './token-budget-report-lib';

/**
 * How much to trust a profile's token count:
 *  - `measured-real-bpe`: the model's own published tokenizer, run
 *    directly against the exact serialized text.
 *  - `measured-legacy-bpe`: a real BPE encode, but on a vocabulary the
 *    vendor published for an older model generation — a genuine token
 *    count, just not provably this model's own vocabulary.
 *  - `estimated-byte-ratio`: no offline tokenizer exists for this model;
 *    this is `bytes / bytesPerEstimatedToken`, a heuristic, not a count.
 */
export type ITokenizerConfidence =
	| 'measured-real-bpe'
	| 'measured-legacy-bpe'
	| 'estimated-byte-ratio';

export interface ITokenizerProfile {
	readonly model: string;
	readonly confidence: ITokenizerConfidence;
	/** The exact tokenizer/package that produced the count, for reproducibility. */
	readonly tokenizerId: string;
	readonly note: string;
}

interface IResolvedTokenizerProfile extends ITokenizerProfile {
	readonly countTokensForText: (jsonText: string) => number;
}

export interface ITokenizerModelEstimate extends ITokenizerProfile {
	readonly tokenCount: number;
}

export interface ITokenizerPresetMeasurement {
	readonly presetId: string;
	readonly toolsListBytes: number;
	readonly toolCount: number;
	readonly estimates: readonly ITokenizerModelEstimate[];
}

export const estimateTokensFromBytes = (bytes: number): number =>
	Math.ceil(bytes / TOKEN_BUDGETS.bytesPerEstimatedToken);

/**
 * One profile per model this dashboard reports on. Real tokenizer
 * packages are used wherever one is actually installed (see
 * `tools/package.json`); everywhere else the fallback is an explicit,
 * clearly labelled byte-ratio estimate — never a silently invented ratio.
 */
const TOKENIZER_PROFILES: readonly IResolvedTokenizerProfile[] = [
	{
		model: 'gpt-5.4',
		confidence: 'measured-real-bpe',
		tokenizerId: 'gpt-tokenizer@4.0.0 (o200k_base, model profile gpt-5.4)',
		note: 'Real BPE encode of the serialized tools/list JSON text via the open-source gpt-tokenizer package.',
		countTokensForText: (jsonText) => countGpt54Tokens(jsonText),
	},
	{
		model: 'claude-sonnet-4',
		confidence: 'measured-legacy-bpe',
		tokenizerId:
			'@anthropic-ai/tokenizer@0.0.4 (last vocabulary Anthropic published offline)',
		note: 'Real BPE encode, but on the pre-Claude-3 vocabulary — Anthropic has not published an offline tokenizer for Claude Sonnet 4, so this is a genuine token count on a DIFFERENT vocabulary, not an exact count for this model.',
		countTokensForText: (jsonText) => countAnthropicLegacyTokens(jsonText),
	},
	{
		model: 'gemini-2.5-pro',
		confidence: 'estimated-byte-ratio',
		tokenizerId: 'heuristic-4-bytes-per-token',
		note: 'No offline Gemini tokenizer package is available; this is bytes / 4, a heuristic estimate, not a measured token count.',
		countTokensForText: (jsonText) =>
			estimateTokensFromBytes(Buffer.byteLength(jsonText, 'utf8')),
	},
];

export const TOKENIZER_MODELS = TOKENIZER_PROFILES.map(
	(profile) => profile.model,
);

/** Real (or, where unavailable, clearly-labelled estimated) token counts
 * for every registered model profile, over one exact JSON text. */
export const buildTokenizerEstimates = (
	jsonText: string,
): readonly ITokenizerModelEstimate[] =>
	TOKENIZER_PROFILES.map((profile) => ({
		model: profile.model,
		confidence: profile.confidence,
		tokenizerId: profile.tokenizerId,
		note: profile.note,
		tokenCount: profile.countTokensForText(jsonText),
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
				const toolList = await connection.client.listTools();
				const tools = toolList.tools as readonly IToolListEntry[];
				const metrics = await listToolsMetrics(
					connection.client,
					connection.pluginIds,
				);
				rows.push({
					presetId,
					toolsListBytes: metrics.toolsListBytes,
					toolCount: metrics.toolCount,
					estimates: buildTokenizerEstimates(
						toolsListJsonText(tools),
					),
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
		...TOKENIZER_MODELS.map((model) => `${model} Tokens`),
		'Confidence',
	].join('\t');
	const body = rows.map((row) => {
		const confidences = row.estimates
			.map((estimate) => `${estimate.model}:${estimate.confidence}`)
			.join(',');
		return [
			row.presetId,
			String(row.toolsListBytes),
			...row.estimates.map((estimate) => String(estimate.tokenCount)),
			confidences,
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
