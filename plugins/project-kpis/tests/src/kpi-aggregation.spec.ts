import { describe, expect, it } from 'vitest';

import type {
	IInvocationRecord,
	IUsageSummary,
} from '@delendai/usage-tracking/public';
import type { IProjectHealthOutput } from '@delendai/project-health/public';

import { KpiSnapshotOutputSchema } from '../../src/lib/contracts/kpi-snapshot.schema';
import { buildKpiSnapshot } from '../../src/lib/services/kpi-aggregation.service';

const FIXED_NOW = new Date('2026-08-29T12:00:00.000Z');

const healthPayload: IProjectHealthOutput = {
	score: 86,
	security: 80,
	deps: 100,
	quality: 88,
	debt: 76,
	next: [
		{
			tool: 'delendai_quality_run_quality',
			reason: 'Quality scopes are heuristic until the owning tool executes.',
		},
	],
	bytes: 200,
	truncated: false,
};

const records: IInvocationRecord[] = [
	{
		ts: '2026-08-29T10:00:00.000Z',
		sessionId: 's1',
		agent: { id: 'copilot', kind: 'copilot', extension: 'vscode-copilot' },
		plugin: 'project-health',
		tool: 'project_health',
		model: null,
		usage: { totalTokens: 120, inputTokens: 80, outputTokens: 40 },
		responseBytes: 600,
		costUsd: null,
		tokensSaved: 25,
		durationMs: 30,
		outcome: 'success',
		fallbackFrom: null,
		error: null,
		autoBypassed: false,
	},
	{
		ts: '2026-08-29T10:05:00.000Z',
		sessionId: 's1',
		agent: { id: 'copilot', kind: 'copilot', extension: 'vscode-copilot' },
		plugin: 'usage-tracking',
		tool: 'usage_report',
		model: null,
		usage: null,
		responseBytes: 420,
		costUsd: null,
		durationMs: 45,
		outcome: 'error',
		fallbackFrom: null,
		error: { code: 'no-pricing', message: 'pricing unavailable' },
		autoBypassed: false,
	},
];

describe('buildKpiSnapshot', async () => {
	it('builds a versioned snapshot and distinguishes measured estimated unavailable and not-configured values', async () => {
		const snapshot = await buildKpiSnapshot({
			namespacePrefix: 'delendai',
			workspaceRootAbs: '/workspace',
			usageSummaryPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/usage-summary.json',
			usageInvocationsPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/invocations.jsonl',
			now: FIXED_NOW,
			pathExists: (path) => path.endsWith('invocations.jsonl'),
			readUsageInvocations: async () => records,
			runProjectHealth: async () => ({
				content: [{ text: JSON.stringify(healthPayload) }],
				structuredContent: { ...healthPayload },
			}),
		});

		expect(KpiSnapshotOutputSchema.parse(snapshot)).toEqual(snapshot);
		expect(snapshot.contract).toBe('project-kpis.snapshot');
		expect(snapshot.version).toBe(1);
		expect(snapshot.health.status).toBe('estimated');
		expect(snapshot.health.score.status).toBe('estimated');
		expect(snapshot.usage.status).toBe('measured');
		expect(snapshot.usage.calls.status).toBe('measured');
		expect(snapshot.usage.costUsd.status).toBe('unavailable');
		expect(snapshot.delivery.status).toBe('not-configured');
		expect(snapshot.usage.calls.value).toBe(2);
		expect(snapshot.usage.errors.value).toBe(1);
		expect(snapshot.usage.totalTokens.value).toBe(120);
		expect(snapshot.usage.tokensSaved.value).toBe(25);
		expect(snapshot.truncated).toBe(false);
	});

	it('falls back to the persisted usage summary and keeps output deterministic and bounded', async () => {
		const usageSummary: IUsageSummary = {
			updatedAt: FIXED_NOW.toISOString(),
			windowDays: 7,
			totals: {
				calls: 10,
				inputTokens: 200,
				outputTokens: 100,
				totalTokens: 300,
				costUsd: 0.75,
				tokensSaved: 50,
				savingsPercent: 17,
				errors: 2,
				autoBypassed: 0,
			},
			byProvider: [],
			byPlugin: Array.from({ length: 8 }, (_, index) => ({
				key: `plugin-${index + 1}`,
				calls: 10 - index,
				inputTokens: 30,
				outputTokens: 15,
				totalTokens: 45,
				costUsd: 0.1,
				tokensSaved: 5,
				savingsPercent: 10,
				errors: index % 2,
				autoBypassed: 0,
			})),
			byAgent: [],
			byExtension: [],
			pluginKpis: [],
			kpis: {
				coldStartCostBytes: 0,
				coldStartCostTokens: 0,
				coldStartCostNote: 'n/a',
				invocationRatePerDay: 1.4,
				successfulCallRate: 0.8,
				responseBytesP50: null,
				responseBytesP95: null,
				latencyMsP50: null,
				latencyMsP95: null,
				toolErrorRate: 0.2,
				averagePluginActivationRate: null,
				dynamicActivationSavingsBytes: null,
				memoryCompactionSavingsTokens: 120,
				memoryCompactionSavingsNote: 'observed',
				contextRehydrationEffectiveness: null,
				contextRehydrationEffectivenessNote: 'unknown',
				privacyGateBlockedReportCount: null,
				privacyGateBlockedReportCountNote: 'unknown',
			},
			autoBypassed: 0,
			limitsStatus: {
				sessionSpendUsd: 0,
				sessionLimitUsd: null,
				sessionLimitPct: null,
				monthlySpendUsd: 0,
				monthlyLimitUsd: null,
				monthlyLimitPct: null,
				breached: null,
			},
			degradations: [],
		};

		const first = await buildKpiSnapshot({
			namespacePrefix: 'delendai',
			workspaceRootAbs: '/workspace',
			usageSummaryPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/usage-summary.json',
			usageInvocationsPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/invocations.jsonl',
			now: FIXED_NOW,
			maxBytes: 900,
			pathExists: (path) => path.endsWith('usage-summary.json'),
			readUsageSummary: async () => usageSummary,
			runProjectHealth: async () => ({
				content: [
					{
						text: JSON.stringify({
							...healthPayload,
							next: Array.from({ length: 6 }, (_, index) => ({
								tool: `tool-${index + 1}`,
								reason: 'bounded',
							})),
						}),
					},
				],
				structuredContent: {
					...healthPayload,
					next: Array.from({ length: 6 }, (_, index) => ({
						tool: `tool-${index + 1}`,
						reason: 'bounded',
					})),
				},
			}),
		});

		const second = await buildKpiSnapshot({
			namespacePrefix: 'delendai',
			workspaceRootAbs: '/workspace',
			usageSummaryPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/usage-summary.json',
			usageInvocationsPathAbs:
				'/workspace/.delendai/cache/results/usage-tracking/invocations.jsonl',
			now: FIXED_NOW,
			maxBytes: 900,
			pathExists: (path) => path.endsWith('usage-summary.json'),
			readUsageSummary: async () => usageSummary,
			runProjectHealth: async () => ({
				content: [
					{
						text: JSON.stringify({
							...healthPayload,
							next: Array.from({ length: 6 }, (_, index) => ({
								tool: `tool-${index + 1}`,
								reason: 'bounded',
							})),
						}),
					},
				],
				structuredContent: {
					...healthPayload,
					next: Array.from({ length: 6 }, (_, index) => ({
						tool: `tool-${index + 1}`,
						reason: 'bounded',
					})),
				},
			}),
		});

		expect(KpiSnapshotOutputSchema.parse(first)).toEqual(first);
		expect(first).toEqual(second);
		expect(first.bytes).toBeLessThanOrEqual(900);
		expect(first.truncated).toBe(true);
		expect(first.health.next.length).toBeLessThanOrEqual(3);
		expect(first.usage.topPlugins.length).toBeLessThanOrEqual(3);
		expect(first.usage.costUsd.status).toBe('measured');
	});
});
