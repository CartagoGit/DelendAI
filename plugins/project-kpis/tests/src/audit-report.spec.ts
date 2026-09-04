import { describe, expect, it } from 'vitest';

import type { IInvocationRecord } from '@delendai/usage-tracking/public';

import type {
	IKpiHistoryReadResult,
	IKpiTrendReport,
} from '../../src/lib/contracts/kpi-history.interface';
import type {
	IKpiMetric,
	IKpiSnapshot,
	TKpiValueStatus,
} from '../../src/lib/contracts/kpi-snapshot.interface';
import { buildAuditReport } from '../../src/lib/services/audit-report.service';
import { buildEfficiencyAnalysis } from '../../src/lib/services/efficiency-analysis.service';

const NOW = '2026-08-29T12:00:00.000Z';
const WINDOW = { from: '2026-08-22T00:00:00.000Z', to: NOW, windowDays: 7 };

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
	observedAt: NOW,
	...(note !== undefined ? { note } : {}),
});

const buildSnapshot = (options: {
	readonly generatedAt: string;
	readonly healthStatus?: TKpiValueStatus;
}): IKpiSnapshot => ({
	contract: 'project-kpis.snapshot',
	version: 1,
	generatedAt: options.generatedAt,
	windowDays: 7,
	health: {
		status: options.healthStatus ?? 'estimated',
		source: 'test/health',
		score: metric('estimated', 'score', 'test/health', 82),
		security: metric('estimated', 'score', 'test/health', 80),
		deps: metric('estimated', 'score', 'test/health', 90),
		quality: metric('estimated', 'score', 'test/health', 88),
		debt: metric('estimated', 'score', 'test/health', 70),
		next: [],
	},
	usage: {
		status: 'measured',
		source: 'test/usage',
		calls: metric('measured', 'count', 'test/usage', 12),
		errors: metric('measured', 'count', 'test/usage', 1),
		toolErrorRate: metric('measured', 'ratio', 'test/usage', 1 / 12),
		totalTokens: metric('measured', 'tokens', 'test/usage', 1024),
		costUsd: metric('measured', 'usd', 'test/usage', 0.25),
		tokensSaved: metric('measured', 'tokens', 'test/usage', 128),
		memoryCompactionSavingsTokens: metric(
			'unavailable',
			'tokens',
			'test/usage',
		),
		topPlugins: [],
	},
	delivery: {
		status: 'measured',
		source: 'test/delivery',
		note: 'delivery snapshot',
	},
	bytes: 2048,
	truncated: false,
});

const buildRecord = (options: {
	readonly plugin: string;
	readonly ts?: string;
	readonly outcome?: IInvocationRecord['outcome'];
	readonly model?: IInvocationRecord['model'];
	readonly requestType?: string;
	readonly costUsd?: number;
	readonly tokensSaved?: number;
	readonly durationMs?: number;
	readonly incongruence?: boolean;
	readonly errorClassification?: string;
	readonly error?: { readonly code: string; readonly message: string } | null;
}): IInvocationRecord => ({
	ts: options.ts ?? NOW,
	sessionId: 's1',
	agent: { id: 'agent-a', kind: 'copilot', extension: 'vscode-copilot' },
	plugin: options.plugin,
	tool: `${options.plugin}-tool`,
	model: options.model ?? null,
	usage: { totalTokens: 128, inputTokens: 64, outputTokens: 64 },
	costUsd: options.costUsd ?? 0.01,
	...(options.tokensSaved !== undefined
		? { tokensSaved: options.tokensSaved }
		: {}),
	durationMs: options.durationMs ?? 120,
	outcome: options.outcome ?? 'success',
	fallbackFrom: null,
	error: options.error ?? null,
	autoBypassed: false,
	...(options.requestType !== undefined
		? { requestType: options.requestType }
		: {}),
	...(options.incongruence !== undefined ||
	options.errorClassification !== undefined
		? {
				errorTelemetry: {
					code: options.error?.code ?? 'E',
					classification:
						options.errorClassification ??
						(options.incongruence === true
							? 'schema-incongruence'
							: 'tool-error'),
					message: options.error?.message ?? 'boom',
					correlationId: null,
					incongruence: options.incongruence ?? false,
					redacted: true,
				},
			}
		: {}),
});

const buildHistory = (entries: number): IKpiHistoryReadResult => ({
	pathAbs: '/tmp/history.json',
	retentionDays: 30,
	totalEntries: entries,
	window: WINDOW,
	entries: Array.from({ length: entries }, (_, index) => ({
		snapshot: buildSnapshot({
			generatedAt: `2026-08-2${index + 1}T12:00:00.000Z`,
		}),
		persistedAt: `2026-08-2${index + 1}T12:00:01.000Z`,
		economics: {
			costUsd: {
				status: 'provider-reported',
				unit: 'usd',
				source: 'test',
				methodology: 'test',
				confidence: 'measured',
				value: 0.25,
			},
			tokenSavings: {
				status: 'provider-reported',
				unit: 'tokens',
				source: 'test',
				methodology: 'test',
				confidence: 'measured',
				value: 128,
			},
			financialSavingsUsd: {
				status: 'unavailable',
				unit: 'usd',
				source: 'test',
				methodology: 'test',
				confidence: 'unavailable',
			},
		},
	})),
});

const buildTrend = (): IKpiTrendReport => ({
	contract: 'project-kpis.trends',
	version: 1,
	window: WINDOW,
	metrics: {
		healthScore: {
			key: 'health.score',
			direction: 'stable',
			status: 'measured',
			source: 'test',
			sampleCount: 2,
		},
		calls: {
			key: 'usage.calls',
			direction: 'up',
			status: 'measured',
			source: 'test',
			sampleCount: 2,
		},
		totalTokens: {
			key: 'usage.totalTokens',
			direction: 'up',
			status: 'measured',
			source: 'test',
			sampleCount: 2,
		},
		costUsd: {
			key: 'economics.costUsd',
			direction: 'up',
			status: 'provider-reported',
			source: 'test',
			sampleCount: 2,
		},
		tokenSavings: {
			key: 'economics.tokenSavings',
			direction: 'up',
			status: 'provider-reported',
			source: 'test',
			sampleCount: 2,
		},
		financialSavingsUsd: {
			key: 'economics.financialSavingsUsd',
			direction: 'unknown',
			status: 'unavailable',
			source: 'test',
			sampleCount: 0,
		},
	},
});

describe('buildAuditReport', () => {
	it('returns a deterministic report with a measured status when the data is clean', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [
				buildRecord({
					plugin: 'git',
					model: { provider: 'acme', modelId: 'm1', kind: 'api' },
					requestType: 'tool-call',
				}),
				buildRecord({
					plugin: 'git',
					model: { provider: 'acme', modelId: 'm1', kind: 'api' },
					requestType: 'tool-call',
				}),
			],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		expect(report.contract).toBe('project-kpis.audit');
		expect(report.version).toBe(1);
		expect(report.source).toBe('project-kpis/S7');
		expect(report.status).toBe('measured');
		expect(report.window).toEqual(WINDOW);
		expect(report.counts.total).toBe(0);
		expect(report.findings).toHaveLength(0);
	});

	it('flags schema/result incongruences as error findings', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [buildRecord({ plugin: 'git', incongruence: true })],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find(
			(item) => item.id === 'schema-incongruence',
		);
		expect(finding).toBeDefined();
		expect(finding?.severity).toBe('error');
		expect(report.status).toBe('partial');
		expect(report.counts.error).toBe(1);
	});

	it('flags unexplained failures when error outcomes carry no classification', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [
				buildRecord({
					plugin: 'git',
					outcome: 'error',
					error: null,
				}),
			],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find(
			(item) => item.id === 'unexplained-failures',
		);
		expect(finding).toBeDefined();
		expect(finding?.severity).toBe('warning');
		expect(finding?.evidence).toContain('1');
	});

	it('flags missing model attribution when telemetry has no model descriptors', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [
				buildRecord({ plugin: 'git' }),
				buildRecord({ plugin: 'search' }),
			],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find(
			(item) => item.id === 'model-attribution-missing',
		);
		expect(finding).toBeDefined();
		expect(finding?.severity).toBe('warning');
	});

	it('flags a stale snapshot when it predates the requested window', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({
				generatedAt: '2026-08-01T00:00:00.000Z',
			}),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [buildRecord({ plugin: 'git' })],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find(
			(item) => item.id === 'stale-snapshot',
		);
		expect(finding).toBeDefined();
		expect(finding?.severity).toBe('warning');
	});

	it('flags a plugin error anomaly when a plugin exceeds the error-rate threshold', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(2),
			trend: buildTrend(),
			records: [
				buildRecord({
					plugin: 'git',
					outcome: 'error',
					error: { code: 'E', message: 'x' },
				}),
				buildRecord({
					plugin: 'git',
					outcome: 'error',
					error: { code: 'E', message: 'x' },
				}),
				buildRecord({
					plugin: 'git',
					outcome: 'error',
					error: { code: 'E', message: 'x' },
				}),
				buildRecord({ plugin: 'git' }),
			],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find((item) =>
			item.id.startsWith('plugin-error-anomaly:'),
		);
		expect(finding).toBeDefined();
		expect(finding?.severity).toBe('warning');
		expect(finding?.evidence).toContain('75%');
	});

	it('stays explicit with no evidence instead of inventing data', () => {
		const report = buildAuditReport({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			history: buildHistory(0),
			trend: buildTrend(),
			records: [],
			summary: null,
			window: WINDOW,
			now: new Date(NOW),
		});

		const finding = report.findings.find(
			(item) => item.id === 'no-local-evidence',
		);
		expect(finding).toBeDefined();
		expect(finding?.status).toBe('not-configured');
	});
});

describe('buildEfficiencyAnalysis', () => {
	it('returns a not-configured status and unknown causality without baseline or evidence', () => {
		const analysis = buildEfficiencyAnalysis({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			trend: buildTrend(),
			summary: null,
			records: [],
			window: WINDOW,
			now: new Date(NOW),
		});

		expect(analysis.contract).toBe('project-kpis.efficiency');
		expect(analysis.version).toBe(1);
		expect(analysis.causality).toBe('unknown');
		expect(analysis.baseline.configured).toBe(false);
		expect(analysis.savings).toHaveLength(0);
		expect(analysis.note).toContain('No savings');
	});

	it('reports measured token savings from the usage rollup', () => {
		const analysis = buildEfficiencyAnalysis({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			trend: buildTrend(),
			summary: null,
			records: [
				buildRecord({ plugin: 'git', tokensSaved: 256 }),
				buildRecord({ plugin: 'search', tokensSaved: 128 }),
			],
			window: WINDOW,
			now: new Date(NOW),
		});

		const saving = analysis.savings.find(
			(item) => item.id === 'token-savings',
		);
		expect(saving).toBeDefined();
		expect(saving?.value).toBe(384);
		expect(saving?.causality).toBe('measured');
		expect(saving?.confidence).toBe('measured');
		expect(analysis.causality).toBe('measured');
		expect(analysis.observations.tokensSaved).toBe(384);
	});

	it('reports inferred financial savings from a configured manual baseline', () => {
		const analysis = buildEfficiencyAnalysis({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			trend: buildTrend(),
			summary: null,
			records: [
				buildRecord({ plugin: 'git', costUsd: 1 }),
				buildRecord({ plugin: 'search', costUsd: 2 }),
			],
			baseline: {
				manualHoursPerTask: 2,
				taskCount: 5,
				developerHourlyCostUsd: 50,
			},
			window: WINDOW,
			now: new Date(NOW),
		});

		const saving = analysis.savings.find(
			(item) => item.id === 'manual-baseline-financial-savings',
		);
		expect(saving).toBeDefined();
		expect(saving?.causality).toBe('inferred');
		expect(saving?.confidence).toBe('inferred');
		expect(analysis.baseline.manualHours).toBe(10);
		expect(analysis.baseline.manualCostUsd).toBe(500);
		expect(saving?.value).toBe(497);
		expect(analysis.causality).toBe('inferred');
	});

	it('derives observations deterministically from records', () => {
		const analysis = buildEfficiencyAnalysis({
			snapshot: buildSnapshot({ generatedAt: NOW }),
			trend: buildTrend(),
			summary: null,
			records: [
				buildRecord({ plugin: 'git', durationMs: 100 }),
				buildRecord({
					plugin: 'git',
					outcome: 'error',
					error: { code: 'E', message: 'x' },
					durationMs: 200,
				}),
				buildRecord({ plugin: 'search' }),
			],
			window: WINDOW,
			now: new Date(NOW),
		});

		expect(analysis.observations.calls).toBe(3);
		expect(analysis.observations.successfulCalls).toBe(2);
		expect(analysis.observations.failedCalls).toBe(1);
		expect(analysis.observations.successRate).toBeCloseTo(2 / 3, 6);
		expect(analysis.observations.averageLatencyMs).toBe(140);
		expect(analysis.observations.tokensPerCall).toBe(128);
	});
});
