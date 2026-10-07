import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import { buildTokenTax } from '../src/lib/token-tax.helper';
import { summarizeLocalKpis } from '../src/lib/rollup';
import { SessionHygieneMonitor } from '../src/lib/session-hygiene';
import { buildUsageTrackingToolRegistrations } from '../src/lib/tools';
import type { IInvocationRecord } from '../src/lib/types';

type Handler = (a: unknown) => Promise<{
	content: Array<{ text: string }>;
	isError?: boolean;
}>;

const captureHandler = async (reg: IToolRegistration): Promise<Handler> => {
	let handler: Handler | undefined;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: Handler) => {
			handler = h;
		},
	} as never);
	if (!handler) throw new Error('handler not registered');
	return handler;
};

const rec = (over: Partial<IInvocationRecord>): IInvocationRecord => ({
	ts: '2026-08-24T10:00:00.000Z',
	sessionId: 'session-1',
	agent: { id: 'copilot-1', kind: 'copilot', extension: 'vscode-copilot' },
	plugin: 'usage-tracking',
	tool: 'usage_report',
	model: null,
	usage: { totalTokens: 200 },
	responseBytes: 1_600,
	costUsd: null,
	tokensSaved: 0,
	durationMs: 30,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
	...over,
});

describe('token tax and local KPIs', () => {
	let dir = '';
	let invocationsPath = '';
	let summaryPath = '';
	let hostLifecyclePath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-token-tax-'));
		invocationsPath = join(dir, 'invocations.jsonl');
		summaryPath = join(dir, 'usage-summary.json');
		hostLifecyclePath = join(dir, 'host-lifecycle.claude-code.jsonl');
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('derives deterministic token tax from observed tools and response bytes', () => {
		const records = [
			rec({ tool: 'usage_report', responseBytes: 1_000 }),
			rec({ tool: 'usage_clear', responseBytes: 2_000 }),
			rec({ tool: 'usage_report', responseBytes: 4_000 }),
		];

		expect(buildTokenTax('usage-tracking', records)).toEqual({
			plugin: 'usage-tracking',
			staticSchemaBytes: 2_048,
			compactTypicalBytes: 2_000,
			p95ResponseBytes: 4_000,
			totalBytes: 8_048,
			estimated: false,
			observedToolCount: 2,
			observedResponseSamples: 3,
			sources: {
				staticSchemaBytes: 'derived-from-observed-distinct-tools',
				compactTypicalBytes: 'observed-response-bytes-p50',
				p95ResponseBytes: 'observed-response-bytes-p95',
			},
		});
	});

	it('uses the typed default when a plugin has no observed records', () => {
		expect(buildTokenTax('search', [])).toEqual({
			plugin: 'search',
			staticSchemaBytes: 4_096,
			compactTypicalBytes: 512,
			p95ResponseBytes: 2_048,
			totalBytes: 6_656,
			estimated: true,
			observedToolCount: 0,
			observedResponseSamples: 0,
			sources: {
				staticSchemaBytes: 'estimated-default-no-observed-tools',
				compactTypicalBytes: 'estimated-default-no-response-bytes',
				p95ResponseBytes: 'estimated-default-no-response-bytes',
			},
		});
	});

	it('computes utility per 1K tokens deterministically and keeps unavailable KPIs null', () => {
		const records = [
			rec({
				sessionId: 'session-1',
				tool: 'usage_report',
				responseBytes: 1_000,
			}),
			rec({
				sessionId: 'session-2',
				tool: 'usage_clear',
				responseBytes: 2_000,
				tokensSaved: 300,
			}),
			rec({
				sessionId: 'session-2',
				plugin: 'memory',
				tool: 'compact',
				responseBytes: 400,
				tokensSaved: 1_200,
			}),
			rec({
				sessionId: 'session-3',
				plugin: 'docs',
				tool: 'docs_read',
				outcome: 'error',
				error: { code: 'x', message: 'failed' },
				responseBytes: 3_000,
			}),
		];

		const summary = summarizeLocalKpis(records, 7);
		const usageTracking = summary.pluginKpis.find(
			(plugin) => plugin.plugin === 'usage-tracking',
		);
		expect(usageTracking?.utilityPer1kTokens).toBe(0.5283);
		expect(usageTracking?.kpis.successContribution).toBe(0.6667);
		expect(usageTracking?.kpis.contextRehydrationEffectiveness).toBeNull();
		expect(usageTracking?.kpis.privacyGateBlockedReportCount).toBeNull();
		expect(summary.kpis.memoryCompactionSavingsTokens).toBe(1_500);
	});

	it('does not leak private paths or args into aggregates or report output', async () => {
		const privatePath = '/home/cartago/secret/project/query.sql';
		const privateArg = 'SELECT * FROM users WHERE token = secret';
		const records = [
			rec({
				plugin: 'docs',
				tool: 'docs_read',
				error: {
					code: 'E_PRIVATE',
					message: `${privatePath} :: ${privateArg}`,
				},
				outcome: 'error',
			}),
		];
		writeFileSync(
			invocationsPath,
			`${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
			'utf8',
		);

		const regs = buildUsageTrackingToolRegistrations({
			namespacePrefix: 'delendai_usage-tracking',
			invocationsPath,
			summaryPath,
			hostLifecyclePath,
			sessionHygiene: new SessionHygieneMonitor({
				maxSessionAgeMs: 2 * 60 * 60 * 1000,
				maxIdleGapMs: 30 * 60 * 1000,
				maxMcpOutputTokens: 8_000,
			}),
		});
		const report = await captureHandler(regs[0]!);
		const result = await report({ groupBy: 'plugin' });
		const text = result.content[0]!.text;

		expect(text).not.toContain(privatePath);
		expect(text).not.toContain(privateArg);
	});
});
