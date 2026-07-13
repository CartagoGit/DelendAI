/**
 * auto-bypass.spec.ts — the non-opt-in auto-bypass counter (f00067 S7).
 */
import { describe, expect, it } from 'vitest';

import {
	countAutoBypassed,
	extractAutoBypassed,
} from '../../../src/lib/auto-bypass';
import { buildRecord } from '../../../src/lib/record';
import { bucketBy, buildSummary, computeTotals } from '../../../src/lib/rollup';
import type { IInvocationRecord } from '../../../src/lib/types';

const agent = { id: 'a', kind: 'unknown', extension: 'unknown' } as const;

describe('extractAutoBypassed', () => {
	it('reads the flag off structuredContent', () => {
		expect(
			extractAutoBypassed({ structuredContent: { autoBypassed: true } }),
		).toBe(true);
	});
	it('reads the flag off a bare object', () => {
		expect(extractAutoBypassed({ autoBypassed: true })).toBe(true);
	});
	it('defaults to false for anything non-true', () => {
		expect(extractAutoBypassed(undefined)).toBe(false);
		expect(extractAutoBypassed({})).toBe(false);
		expect(extractAutoBypassed({ autoBypassed: 'yes' })).toBe(false);
		expect(extractAutoBypassed({ autoBypassed: 1 })).toBe(false);
	});
});

describe('buildRecord lifts the auto-bypass flag (not opt-in)', () => {
	const base = {
		toolName: 'mcp-vertex_orchestrator-runner_invoke',
		corePrefix: 'mcp-vertex',
		peerPrefixes: [],
		agent,
		sessionId: 's',
		endedAt: Date.parse('2026-07-15T10:00:00.000Z'),
		costOf: () => 1,
	};

	it('stamps autoBypassed:true when the invoke result carries it', () => {
		const record = buildRecord({
			...base,
			args: {},
			result: { structuredContent: { autoBypassed: true } },
		});
		expect(record.autoBypassed).toBe(true);
	});

	it('stamps autoBypassed:false when the result omits it', () => {
		const record = buildRecord({
			...base,
			args: {},
			result: { structuredContent: {} },
		});
		expect(record.autoBypassed).toBe(false);
	});
});

const rec = (autoBypassed: boolean): IInvocationRecord => ({
	ts: '2026-07-15T10:00:00.000Z',
	sessionId: 's',
	agent,
	plugin: 'orchestrator-runner',
	tool: 'invoke',
	model: { provider: 'openai', modelId: 'gpt', kind: 'api' },
	usage: null,
	costUsd: 1,
	durationMs: null,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed,
});

describe('counting rolls up per-bucket and into the summary', () => {
	const records = [rec(true), rec(true), rec(false)];

	it('countAutoBypassed totals the flagged rows', () => {
		expect(countAutoBypassed(records)).toBe(2);
	});

	it('bucketBy carries autoBypassed per provider', () => {
		const buckets = bucketBy(records, 'provider', 'costUsd');
		expect(buckets[0]?.autoBypassed).toBe(2);
	});

	it('computeTotals + buildSummary expose the counter', () => {
		expect(computeTotals(records).autoBypassed).toBe(2);
		const summary = buildSummary(
			records,
			7,
			Date.parse('2026-07-15T12:00:00.000Z'),
		);
		expect(summary.autoBypassed).toBe(2);
	});
});
