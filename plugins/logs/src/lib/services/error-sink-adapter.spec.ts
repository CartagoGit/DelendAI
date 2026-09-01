/**
 * error-sink-adapter.spec.ts — f00251 S3 (unit tests).
 *
 * All ICapturedError fields are exercised through the adapter without
 * touching real file I/O — the `appendEvent` option is a plain in-memory
 * stub so tests stay fast and side-effect-free.
 */

import { describe, expect, it } from 'vitest';

import type { ICapturedError } from '@mcp-vertex/core/public';

import { createLogsErrorSinkAdapter } from './error-sink-adapter';
import type { ILogEvent } from './normalize-event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildCapturedError = (
	overrides: Partial<ICapturedError> = {},
): ICapturedError => ({
	kind: 'captured-error',
	ts: '2026-08-26T10:00:00.000Z',
	fingerprint: 'abc123fingerprint',
	errorCode: 'ERR_TEST',
	errorName: 'Error',
	severity: 'error',
	classification: 'GENERAL_ERROR',
	toolName: 'demo_tool',
	packageId: 'test-package',
	pluginName: 'test-plugin',
	summary: 'test error summary',
	stackHead: 'Error: test\n    at foo (bar.ts:1:1)\n    at baz (qux.ts:2:2)',
	byteCount: 100,
	truncated: false,
	...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLogsErrorSinkAdapter', () => {
	it('round-trip: ICapturedError → ILogEvent with expected fields', async () => {
		const captured: ILogEvent[] = [];
		const { sink } = createLogsErrorSinkAdapter({
			appendEvent: async (event) => {
				captured.push(event);
			},
		});
		const error = buildCapturedError({
			severity: 'critical',
			classification: 'TYPE_ERROR',
			errorCode: 'TypeError',
			toolName: 'demo_tool',
		});

		await sink.record(error);

		expect(captured).toHaveLength(1);
		const event = captured[0]!;
		expect(event.kind).toBe('log-warning');
		expect(event.outcome).toBe('failed');
		expect(event.severity).toBe('critical');
		expect(event.incidentType).toBe('demo_tool');
		expect(event.taskId).toBe('demo_tool');
		expect(event.meta.sink).toBe('logs-error');
		expect(event.meta.errorCode).toBe('TypeError');
		expect(event.summary).toContain('incident-error: demo_tool');
	});

	it('redaction proof: secret in summary is stripped before ILogEvent is built', async () => {
		const stderrChunks: string[] = [];
		const origWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array): boolean => {
			stderrChunks.push(
				typeof chunk === 'string'
					? chunk
					: Buffer.from(chunk).toString(),
			);
			return true;
		};
		try {
			const captured: ILogEvent[] = [];
			const { sink } = createLogsErrorSinkAdapter({
				appendEvent: async (event) => {
					captured.push(event);
				},
			});
			const secret = 'sk-test-12345-secret';
			const error = buildCapturedError({
				summary: `crash: API_KEY=${secret}`,
			});

			await sink.record(error);

			expect(captured).toHaveLength(1);
			const event = captured[0]!;
			// Defense-in-depth redaction: the secret must not reach the JSONL event.
			expect(event.summary).not.toContain(secret);
			// The adapter also must not echo the secret on stderr.
			const stderrOutput = stderrChunks.join('');
			expect(stderrOutput).not.toContain(secret);
		} finally {
			process.stderr.write = origWrite;
		}
	});

	it('never-throws: resolves even when appendEvent throws synchronously', async () => {
		const stderrChunks: string[] = [];
		const origWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array): boolean => {
			stderrChunks.push(
				typeof chunk === 'string'
					? chunk
					: Buffer.from(chunk).toString(),
			);
			return true;
		};
		try {
			const { sink, getStats } = createLogsErrorSinkAdapter({
				appendEvent: async () => {
					throw new Error('disk full');
				},
			});

			await expect(
				sink.record(buildCapturedError()),
			).resolves.toBeUndefined();
			expect(getStats().recordsRejected).toBe(1);
			expect(getStats().recordsAccepted).toBe(0);
			const stderr = stderrChunks.join('');
			expect(stderr).toContain('[logs-error-sink]');
			expect(stderr).toContain('disk full');
		} finally {
			process.stderr.write = origWrite;
		}
	});

	it('determinism: two calls with the same event produce identical ILogEvents', async () => {
		const captured: ILogEvent[] = [];
		const { sink } = createLogsErrorSinkAdapter({
			appendEvent: async (event) => {
				captured.push(event);
			},
		});
		const error = buildCapturedError();
		await sink.record(error);
		await sink.record(error);

		expect(captured).toHaveLength(2);
		// Both events must be structurally identical (no random ids injected).
		expect(JSON.stringify(captured[0])).toBe(JSON.stringify(captured[1]));
	});

	it('malformed input: undefined toolName is defaulted to "unknown", event is not dropped', async () => {
		const captured: ILogEvent[] = [];
		const { sink, getStats } = createLogsErrorSinkAdapter({
			appendEvent: async (event) => {
				captured.push(event);
			},
		});
		// Cast through unknown to simulate a schema-violating payload.
		const malformed = buildCapturedError({
			toolName: undefined as unknown as string,
		});

		await sink.record(malformed);

		// Adapter prefers to record with a fallback rather than drop.
		expect(getStats().recordsAccepted).toBe(1);
		expect(getStats().recordsRejected).toBe(0);
		expect(captured[0]!.taskId).toBe('unknown');
	});
});
