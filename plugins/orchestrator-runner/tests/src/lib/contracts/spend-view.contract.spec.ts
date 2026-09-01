#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	SPEND_DETAIL_PROJECTIONS,
	projectSpendCompact,
	projectSpendFull,
	projectSpendNormal,
	type ISpendFullView,
} from '@mcp-vertex/orchestrator-runner/lib/contracts/spend-view.contract';
import { projectDetail } from '@mcp-vertex/core/public';

const buildFull = (): ISpendFullView => ({
	windowDays: 30,
	generatedAt: '2026-08-26T00:00:00.000Z',
	currentState: {
		byProvider: [
			{
				key: 'p1',
				calls: 10,
				inputTokens: 100,
				outputTokens: 50,
				totalTokens: 150,
				costUsd: 0.5,
				errors: 0,
				autoBypassed: 0,
			},
		],
		byPlugin: [
			{
				key: 'proposals',
				calls: 5,
				inputTokens: 80,
				outputTokens: 40,
				totalTokens: 120,
				costUsd: 0.3,
				errors: 0,
				autoBypassed: 0,
			},
			{
				key: 'audit',
				calls: 3,
				inputTokens: 60,
				outputTokens: 20,
				totalTokens: 80,
				costUsd: 0.2,
				errors: 0,
				autoBypassed: 0,
			},
		],
		byAgent: [],
		byExtension: [],
		limitsStatus: {
			sessionSpendUsd: 12,
			sessionLimitUsd: 50,
			sessionLimitPct: 24,
			monthlySpendUsd: 88,
			monthlyLimitUsd: 100,
			monthlyLimitPct: 88,
			breached: null,
		},
	},
	observations: ['session spend at 24% of cap', 'monthly spend at 88%'],
	recommendations: [
		{ title: 'switch model', detail: '...', riskLevel: 'low' },
		{ title: 'review cache', detail: '...', riskLevel: 'medium' },
	],
});

describe('spend_view projections (r00032)', () => {
	it('compact exposes only the headline numbers', () => {
		const v = projectSpendCompact(buildFull());
		expect(v.sessionSpendUsd).toBe(12);
		expect(v.monthlySpendUsd).toBe(88);
		expect(v.breached).toBeNull();
		expect(v.topRecommendation?.title).toBe('switch model');
	});

	it('compact serialises under 2 KB', () => {
		const v = projectSpendCompact(buildFull());
		expect(JSON.stringify(v).length).toBeLessThan(2_000);
	});

	it('normal extends compact with observations and full recommendations', () => {
		const v = projectSpendNormal(buildFull());
		expect(v.observations).toHaveLength(2);
		expect(v.recommendations).toHaveLength(2);
		expect(v.topByPlugin[0]?.key).toBe('proposals');
	});

	it('normal serialises under 10 KB', () => {
		const v = projectSpendNormal(buildFull());
		expect(JSON.stringify(v).length).toBeLessThan(10_000);
	});

	it('full preserves the full view', () => {
		const full = buildFull();
		expect(projectSpendFull(full)).toBe(full);
	});

	it('projectDetail defaults to normal when no level requested', () => {
		const full = buildFull();
		const out = projectDetail(full, SPEND_DETAIL_PROJECTIONS) as ReturnType<
			typeof projectSpendNormal
		>;
		expect(out.observations).toHaveLength(2);
	});

	it('compact returns null topRecommendation when no recs exist', () => {
		const full = buildFull();
		const v = projectSpendCompact({
			...full,
			recommendations: [],
		});
		expect(v.topRecommendation).toBeNull();
	});
});
