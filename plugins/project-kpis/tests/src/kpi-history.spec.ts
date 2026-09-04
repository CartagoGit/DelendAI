import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IKpiHistoryEntry } from '../../src/lib/contracts/kpi-history.interface';
import type {
	IKpiMetric,
	IKpiSnapshot,
	TKpiValueStatus,
} from '../../src/lib/contracts/kpi-snapshot.interface';
import {
	DEFAULT_KPI_HISTORY_RETENTION_DAYS,
	persistKpiSnapshotHistory,
	readKpiHistoryWindow,
} from '../../src/lib/services/kpi-history.service';
import { buildKpiTrendReport } from '../../src/lib/services/kpi-trends.service';

const CACHE_DIR = '.cache/delendai';

const metric = (
	status: TKpiValueStatus,
	unit: IKpiMetric['unit'],
	source: string,
	value?: number,
	note?: string,
): IKpiMetric => ({
	status,
	unit,
	source,
	...(value !== undefined ? { value } : {}),
	observedAt: '2026-08-29T12:00:00.000Z',
	...(note !== undefined ? { note } : {}),
});

const buildSnapshot = (options: {
	readonly generatedAt: string;
	readonly score: number;
	readonly calls: number;
	readonly totalTokens?: number;
	readonly totalTokensStatus?: TKpiValueStatus;
	readonly costUsd?: number;
	readonly costStatus?: TKpiValueStatus;
	readonly tokenSavings?: number;
	readonly tokenSavingsStatus?: TKpiValueStatus;
}): IKpiSnapshot => ({
	contract: 'project-kpis.snapshot',
	version: 1,
	generatedAt: options.generatedAt,
	windowDays: 7,
	health: {
		status: 'estimated',
		source: 'test/health',
		score: metric('estimated', 'score', 'test/health', options.score),
		security: metric('estimated', 'score', 'test/health', 80),
		deps: metric('estimated', 'score', 'test/health', 90),
		quality: metric('estimated', 'score', 'test/health', 88),
		debt: metric('estimated', 'score', 'test/health', 70),
		next: [],
	},
	usage: {
		status: 'measured',
		source: 'test/usage',
		calls: metric('measured', 'count', 'test/usage', options.calls),
		errors: metric('measured', 'count', 'test/usage', 1),
		toolErrorRate: metric('measured', 'ratio', 'test/usage', 0.1),
		totalTokens: metric(
			options.totalTokensStatus ?? 'measured',
			'tokens',
			'test/usage',
			options.totalTokens,
		),
		costUsd: metric(
			options.costStatus ?? 'unavailable',
			'usd',
			'test/usage',
			options.costUsd,
		),
		tokensSaved: metric(
			options.tokenSavingsStatus ?? 'unavailable',
			'tokens',
			'test/usage',
			options.tokenSavings,
		),
		memoryCompactionSavingsTokens: metric(
			'measured',
			'tokens',
			'test/usage',
			10,
		),
		topPlugins: [],
	},
	delivery: {
		status: 'not-configured',
		source: 'test/delivery',
		note: 'deferred',
	},
	bytes: 512,
	truncated: false,
});

describe('kpi history + trends', async () => {
	let workspaceRoot = '';

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'project-kpis-'));
	});

	afterEach(() => {
		rmSync(workspaceRoot, { recursive: true, force: true });
	});

	it('persists snapshots atomically, prunes by retention and reads a bounded window', async () => {
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 1,
			now: new Date('2026-08-27T12:00:00.000Z'),
			snapshot: buildSnapshot({
				generatedAt: '2026-08-27T12:00:00.000Z',
				score: 80,
				calls: 20,
				totalTokens: 300,
				costUsd: 1,
				costStatus: 'measured',
				tokenSavings: 60,
				tokenSavingsStatus: 'measured',
			}),
		});
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 1,
			now: new Date('2026-08-28T12:00:00.000Z'),
			snapshot: buildSnapshot({
				generatedAt: '2026-08-28T12:00:00.000Z',
				score: 82,
				calls: 18,
				totalTokens: 250,
				costUsd: 1.1,
				costStatus: 'measured',
				tokenSavings: 58,
				tokenSavingsStatus: 'measured',
			}),
		});
		const persisted = await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 1,
			now: new Date('2026-08-29T12:00:00.000Z'),
			snapshot: buildSnapshot({
				generatedAt: '2026-08-29T12:00:00.000Z',
				score: 85,
				calls: 15,
				totalTokens: 200,
				costUsd: 1.05,
				costStatus: 'measured',
				tokenSavings: 55,
				tokenSavingsStatus: 'measured',
			}),
		});

		expect(persisted.prunedEntries).toBe(1);
		expect(persisted.retainedEntries).toBe(2);
		expect(existsSync(persisted.pathAbs)).toBe(true);

		const history = await readKpiHistoryWindow({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			now: new Date('2026-08-29T12:00:00.000Z'),
			windowDays: 1,
		});

		expect(history.pathAbs).toBe(
			join(
				workspaceRoot,
				CACHE_DIR,
				'results',
				'project-kpis',
				'history.json',
			),
		);
		expect(history.retentionDays).toBe(1);
		expect(history.totalEntries).toBe(2);
		expect(
			history.entries.map((entry) => entry.snapshot.generatedAt),
		).toEqual(['2026-08-28T12:00:00.000Z', '2026-08-29T12:00:00.000Z']);
	});

	it('applies the requested retention when reading an existing store', async () => {
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 30,
			now: new Date('2026-08-01T12:00:00.000Z'),
			snapshot: buildSnapshot({
				generatedAt: '2026-08-01T12:00:00.000Z',
				score: 80,
				calls: 10,
			}),
		});
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 30,
			now: new Date('2026-08-29T12:00:00.000Z'),
			snapshot: buildSnapshot({
				generatedAt: '2026-08-29T12:00:00.000Z',
				score: 85,
				calls: 8,
			}),
		});

		const history = await readKpiHistoryWindow({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			retentionDays: 1,
			now: new Date('2026-08-29T12:00:00.000Z'),
			windowDays: 30,
		});

		expect(history.retentionDays).toBe(1);
		expect(history.totalEntries).toBe(1);
		expect(history.entries).toHaveLength(1);
		expect(history.entries[0]?.snapshot.generatedAt).toBe(
			'2026-08-29T12:00:00.000Z',
		);
	});

	it('persists explicit economics semantics without inventing missing savings data', async () => {
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			snapshot: buildSnapshot({
				generatedAt: '2026-08-26T12:00:00.000Z',
				score: 80,
				calls: 10,
				totalTokens: 100,
				costUsd: 1.25,
				costStatus: 'measured',
				tokenSavings: 20,
				tokenSavingsStatus: 'measured',
			}),
		});
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			snapshot: buildSnapshot({
				generatedAt: '2026-08-27T12:00:00.000Z',
				score: 81,
				calls: 9,
				totalTokens: 95,
				costUsd: 0.9,
				costStatus: 'estimated',
				tokenSavings: 25,
				tokenSavingsStatus: 'estimated',
			}),
			economics: {
				financialSavingsUsd: {
					status: 'configured-estimate',
					source: 'baseline/config',
					methodology:
						'Configured token baseline * configured price estimate.',
					confidence: 'estimated',
					value: 0.3,
				},
			},
		});
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			snapshot: buildSnapshot({
				generatedAt: '2026-08-28T12:00:00.000Z',
				score: 82,
				calls: 8,
				totalTokensStatus: 'unavailable',
				costStatus: 'unavailable',
				tokenSavingsStatus: 'unavailable',
			}),
			economics: {
				costUsd: {
					status: 'subscription',
					source: 'workspace/subscription',
					methodology:
						'Flat subscription cost, not attributable per invocation.',
					confidence: 'not-configured',
					note: 'Seat subscription only.',
				},
			},
		});
		await persistKpiSnapshotHistory({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			snapshot: buildSnapshot({
				generatedAt: '2026-08-29T12:00:00.000Z',
				score: 83,
				calls: 7,
				totalTokensStatus: 'unavailable',
				costStatus: 'unavailable',
				tokenSavingsStatus: 'unavailable',
			}),
		});

		const history = await readKpiHistoryWindow({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
			windowDays: 30,
			now: new Date('2026-08-29T12:00:00.000Z'),
		});

		expect(
			history.entries.map((entry) => entry.economics.costUsd.status),
		).toEqual([
			'provider-reported',
			'configured-estimate',
			'subscription',
			'unavailable',
		]);
		expect(history.entries[0]?.economics.financialSavingsUsd.status).toBe(
			'unavailable',
		);
		expect(history.entries[1]?.economics.financialSavingsUsd.value).toBe(
			0.3,
		);
		expect(
			history.entries[3]?.economics.financialSavingsUsd.value,
		).toBeUndefined();
	});

	it('computes up down stable and unknown trends from the selected window', async () => {
		const entries: IKpiHistoryEntry[] = [
			{
				snapshot: buildSnapshot({
					generatedAt: '2026-08-27T12:00:00.000Z',
					score: 80,
					calls: 20,
					totalTokens: 300,
					costUsd: 1,
					costStatus: 'measured',
					tokenSavings: 10,
					tokenSavingsStatus: 'measured',
				}),
				persistedAt: '2026-08-27T12:01:00.000Z',
				economics: {
					costUsd: {
						status: 'provider-reported',
						unit: 'usd',
						source: 'test/usage',
						methodology: 'Measured provider invoice attribution.',
						confidence: 'measured',
						value: 1,
					},
					tokenSavings: {
						status: 'provider-reported',
						unit: 'tokens',
						source: 'test/usage',
						methodology: 'Measured savings baseline.',
						confidence: 'measured',
						value: 10,
					},
					financialSavingsUsd: {
						status: 'unavailable',
						unit: 'usd',
						source: 'project-kpis/S3',
						methodology: 'No attributable savings baseline.',
						confidence: 'unavailable',
					},
				},
			},
			{
				snapshot: buildSnapshot({
					generatedAt: '2026-08-28T12:00:00.000Z',
					score: 85,
					calls: 15,
					totalTokens: 220,
					costUsd: 1.002,
					costStatus: 'measured',
					tokenSavings: 14,
					tokenSavingsStatus: 'measured',
				}),
				persistedAt: '2026-08-28T12:01:00.000Z',
				economics: {
					costUsd: {
						status: 'provider-reported',
						unit: 'usd',
						source: 'test/usage',
						methodology: 'Measured provider invoice attribution.',
						confidence: 'measured',
						value: 1.002,
					},
					tokenSavings: {
						status: 'provider-reported',
						unit: 'tokens',
						source: 'test/usage',
						methodology: 'Measured savings baseline.',
						confidence: 'measured',
						value: 14,
					},
					financialSavingsUsd: {
						status: 'unavailable',
						unit: 'usd',
						source: 'project-kpis/S3',
						methodology: 'No attributable savings baseline.',
						confidence: 'unavailable',
					},
				},
			},
			{
				snapshot: buildSnapshot({
					generatedAt: '2026-08-29T12:00:00.000Z',
					score: 90,
					calls: 10,
					totalTokens: 200,
					costUsd: 1.0004,
					costStatus: 'measured',
					tokenSavings: 20,
					tokenSavingsStatus: 'measured',
				}),
				persistedAt: '2026-08-29T12:01:00.000Z',
				economics: {
					costUsd: {
						status: 'provider-reported',
						unit: 'usd',
						source: 'test/usage',
						methodology: 'Measured provider invoice attribution.',
						confidence: 'measured',
						value: 1.0004,
					},
					tokenSavings: {
						status: 'provider-reported',
						unit: 'tokens',
						source: 'test/usage',
						methodology: 'Measured savings baseline.',
						confidence: 'measured',
						value: 20,
					},
					financialSavingsUsd: {
						status: 'unavailable',
						unit: 'usd',
						source: 'project-kpis/S3',
						methodology: 'No attributable savings baseline.',
						confidence: 'unavailable',
					},
				},
			},
		];
		const report = buildKpiTrendReport(entries, {
			windowDays: 2,
			stableDeltaPercent: 0.01,
			stableAbsoluteDelta: 0.01,
		});

		expect(report.metrics.healthScore.direction).toBe('up');
		expect(report.metrics.calls.direction).toBe('down');
		expect(report.metrics.costUsd.direction).toBe('stable');
		expect(report.metrics.financialSavingsUsd.direction).toBe('unknown');
		expect(report.metrics.tokenSavings.direction).toBe('up');
	});

	it('uses the default retention when none is configured', async () => {
		const result = await readKpiHistoryWindow({
			workspaceRootAbs: workspaceRoot,
			cacheDir: CACHE_DIR,
		});

		expect(result.retentionDays).toBe(DEFAULT_KPI_HISTORY_RETENTION_DAYS);
		expect(result.entries).toEqual([]);
	});
});
