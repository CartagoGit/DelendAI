/**
 * logs-sink.spec.ts — f00154 S2.
 *
 * Tests the ILogsSink contract: the `LogsPluginSink` and
 * `ConsoleLogsSink` impls, plus the `sinkEventFromInput` adapter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ConsoleLogsSink,
	LogsPluginSink,
	sinkEventFromInput,
} from '../../../../src/lib/plugins/logs-sink';

const sampleEvent = {
	ts: '2026-07-26T10:00:00.000Z',
	kind: 'tool-failed',
	outcome: 'failed' as const,
	severity: 'error' as const,
	incidentType: 'tool-failure',
	toolName: 'foo',
	taskId: 'foo',
	agent: 'a1',
	summary: 'tool-failed: foo',
	meta: { ok: false },
};

describe('LogsPluginSink (f00154 S2)', () => {
	it('delegates record to the supplied appendEvent closure', async () => {
		const calls: unknown[] = [];
		const sink = new LogsPluginSink(async (event) => {
			calls.push(event);
		});
		await sink.record(sampleEvent);
		expect(calls).toHaveLength(1);
		const first = calls[0] as Record<string, unknown>;
		expect(first.kind).toBe('tool-failed');
		expect(first.outcome).toBe('failed');
		expect(first.severity).toBe('error');
		expect(first.incidentType).toBe('tool-failure');
		expect(first.taskId).toBe('foo');
	});

	it('preserves cancellation reason and recovery alternative in the error metadata', async () => {
		const calls: unknown[] = [];
		const sink = new LogsPluginSink(async (event) => {
			calls.push(event);
		});
		await sink.record({
			...sampleEvent,
			kind: 'tool-cancelled',
			outcome: 'cancelled',
			severity: 'notice',
			incidentType: 'tool-cancelled',
			summary: 'tool-cancelled: spec_slow: user stopped duplicate work',
			meta: {
				reason: 'user stopped duplicate work',
				nextAction: 'Retry the operation or resume from checkpoint.',
				error: new Error('user stopped duplicate work'),
			},
		});
		const event = calls[0] as { meta: Record<string, unknown> };
		expect(event.meta.reason).toBe('user stopped duplicate work');
		expect(event.meta.nextAction).toContain('Retry');
		expect(event.meta.error).toBeInstanceOf(Error);
	});

	it('has id "logs-plugin"', () => {
		const sink = new LogsPluginSink(async () => {});
		expect(sink.id).toBe('logs-plugin');
	});
});

describe('ConsoleLogsSink (f00154 S2)', () => {
	let stderrChunks: string[] = [];
	const originalWrite = process.stderr.write.bind(process.stderr);
	beforeEach(() => {
		stderrChunks = [];
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return true;
		}) as typeof process.stderr.write;
	});
	afterEach(() => {
		process.stderr.write = originalWrite;
	});

	it('writes one redacted JSON line per event to stderr', async () => {
		const sink = new ConsoleLogsSink();
		await sink.record({
			...sampleEvent,
			summary:
				'tool-failed: foo — token ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL',
			meta: { secret: 'AKIA1234567890ABCDEF' },
		});
		expect(stderrChunks).toHaveLength(1);
		const line = stderrChunks[0]?.replace(/\n$/, '') ?? '';
		const parsed = JSON.parse(line) as {
			ts: string;
			kind: string;
			summary: string;
			meta: { secret: string };
		};
		expect(parsed.kind).toBe('tool-failed');
		// The summary and meta fields are redacted on the way out.
		expect(parsed.summary).not.toContain('ghp_');
		expect(parsed.meta.secret).not.toContain('AKIA');
	});

	it('is a no-op when quiet: true', async () => {
		const sink = new ConsoleLogsSink({ quiet: true });
		await sink.record({
			...sampleEvent,
			kind: 'tool-completed',
			outcome: 'ok',
			severity: 'info',
			incidentType: 'tool-invocation',
			toolName: 'bar',
			taskId: 'bar',
		});
		expect(stderrChunks).toHaveLength(0);
	});
});

describe('sinkEventFromInput (f00154 S2)', () => {
	it('translates severity=error to outcome=failed so the event lands in the error stream', () => {
		const event = sinkEventFromInput(
			{
				severity: 'error',
				incidentType: 'lock-conflict',
				message: 'agents/proposals.lock held > 30s',
				files: ['agents/proposals.lock'],
				agent: 'peer-1',
			},
			'2026-07-26T10:00:00.000Z',
		);
		expect(event.outcome).toBe('failed');
		expect(event.severity).toBe('error');
		expect(event.incidentType).toBe('lock-conflict');
		expect(event.summary).toContain('lock-conflict');
		expect(event.meta.source).toBe('ctx.logs');
	});

	it('translates severity=info to outcome=ok so the event stays on the main timeline', () => {
		const event = sinkEventFromInput(
			{
				severity: 'info',
				incidentType: 'tool-invocation',
				message: 'x',
			},
			'2026-07-26T10:00:00.000Z',
		);
		expect(event.outcome).toBe('ok');
	});
});
