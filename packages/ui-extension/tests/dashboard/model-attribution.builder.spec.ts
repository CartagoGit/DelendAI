import { describe, expect, it } from 'vitest';

import { USAGE_TRACKING_OPT_IN_SNIPPET } from '../../src/contracts/constants/opt-in-snippets.constant';
import type { IModelAttributionReportPayload } from '../../src/contracts/interfaces/model-attribution.interface';
import { buildModelAttributionModel } from '../../src/dashboard/builders/model-attribution.builder';

const report: IModelAttributionReportPayload = {
	groupBy: 'model',
	totals: {
		calls: 4,
		totalTokens: 1_500,
		costUsd: 2.5,
		tokensSaved: 600,
		savingsPercent: 40,
	},
	buckets: [
		{
			key: 'anthropic/sonnet',
			calls: 1,
			totalTokens: 300,
			costUsd: 0.5,
			tokensSaved: 100,
			savingsPercent: 33,
		},
		{
			key: 'openai/gpt-5-codex',
			calls: 2,
			totalTokens: 1_000,
			costUsd: 2,
			tokensSaved: 500,
			savingsPercent: 50,
		},
		{
			key: 'unattributed',
			calls: 1,
			totalTokens: 200,
			costUsd: 0,
			tokensSaved: 0,
			savingsPercent: 0,
		},
	],
};

describe('buildModelAttributionModel', () => {
	it('sorts models by savings and builds relative bars', () => {
		const model = buildModelAttributionModel(report);
		if (model.kind !== 'ready') throw new Error('expected ready');
		expect(model.rows.map((row) => row.key)).toEqual([
			'openai/gpt-5-codex',
			'anthropic/sonnet',
			'unattributed',
		]);
		expect(model.rows[0]).toMatchObject({
			tokensSaved: 500,
			savingsBarPct: 100,
		});
		expect(model.rows[1]?.savingsBarPct).toBe(20);
		expect(model.totals.tokensSaved).toBe(600);
	});

	it('marks the unattributed bucket explicitly', () => {
		const model = buildModelAttributionModel(report);
		if (model.kind !== 'ready') throw new Error('expected ready');
		expect(
			model.rows.find((row) => row.key === 'unattributed'),
		).toMatchObject({
			unattributed: true,
			tokensSaved: 0,
		});
	});

	it('represents an empty loaded log without inventing rows', () => {
		const model = buildModelAttributionModel({
			groupBy: 'model',
			totals: {
				calls: 0,
				totalTokens: 0,
				costUsd: 0,
				tokensSaved: 0,
				savingsPercent: 0,
			},
			buckets: [],
		});
		expect(model).toMatchObject({ kind: 'ready', empty: true, rows: [] });
	});

	it('degrades to the canonical opt-in hint when the plugin is absent', () => {
		const model = buildModelAttributionModel(undefined);
		expect(model).toEqual({
			kind: 'plugin-absent',
			plugin: 'usage-tracking',
			hint: expect.stringContaining('opt-in'),
			configSnippet: USAGE_TRACKING_OPT_IN_SNIPPET,
		});
	});
});
