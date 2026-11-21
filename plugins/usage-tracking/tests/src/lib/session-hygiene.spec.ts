import { describe, expect, it } from 'vitest';

import {
	analyzeSessionHygiene,
	SessionHygieneMonitor,
} from '../../../src/lib/session-hygiene';
import type { IInvocationRecord } from '../../../src/lib/types';

const record = (
	ts: string,
	responseBytes: number,
	sessionId = 's-1',
): IInvocationRecord => ({
	ts,
	sessionId,
	agent: { id: 'claude', kind: 'claude-code', extension: 'claude-code' },
	plugin: 'docs',
	tool: 'read',
	model: null,
	usage: null,
	responseBytes,
	costUsd: null,
	durationMs: 1,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
});

const policy = {
	maxSessionAgeMs: 60 * 60 * 1000,
	maxIdleGapMs: 10 * 60 * 1000,
	maxMcpOutputTokens: 100,
};

describe('session hygiene', () => {
	it('reports only local MCP evidence and all exceeded reasons', () => {
		const snapshots = analyzeSessionHygiene(
			[
				record('2026-07-24T10:00:00.000Z', 200),
				record('2026-07-24T11:30:00.000Z', 400),
			],
			policy,
		);
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toMatchObject({
			observedMcpOnly: true,
			calls: 2,
			responseBytes: 600,
			estimatedMcpOutputTokens: 150,
			largestIdleGapMs: 90 * 60 * 1000,
			reasons: ['session-age', 'idle-gap', 'mcp-output-volume'],
		});
	});

	it('treats legacy rows without response bytes as zero', () => {
		const legacy = { ...record('2026-07-24T10:00:00.000Z', 0) };
		delete legacy.responseBytes;
		const snapshot = analyzeSessionHygiene([legacy], policy)[0];
		expect(snapshot?.responseBytes).toBe(0);
		expect(snapshot?.estimatedMcpOutputTokens).toBe(0);
	});

	it('emits each breach once while retaining a current snapshot', () => {
		const monitor = new SessionHygieneMonitor(policy);
		expect(
			monitor.observe({
				sessionId: 's-1',
				at: Date.parse('2026-07-24T10:00:00.000Z'),
				responseBytes: 300,
			}),
		).toBeNull();
		const first = monitor.observe({
			sessionId: 's-1',
			at: Date.parse('2026-07-24T11:30:00.000Z'),
			responseBytes: 500,
		});
		expect(first?.newlyBreached).toEqual([
			'session-age',
			'idle-gap',
			'mcp-output-volume',
		]);
		expect(
			monitor.observe({
				sessionId: 's-1',
				at: Date.parse('2026-07-24T11:31:00.000Z'),
				responseBytes: 0,
			}),
		).toBeNull();
		expect(monitor.snapshots()[0]?.reasons).toHaveLength(3);
	});
});
