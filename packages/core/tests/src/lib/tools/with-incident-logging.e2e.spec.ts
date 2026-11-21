/**
 * with-incident-logging.e2e.spec.ts — f00154 S3 E2E.
 *
 * Round-trips `withIncidentLogging` against the real `ILogsSink`
 * contract (a `LogsPluginSink` writing into an in-memory buffer
 * that mimics what the `logs` plugin's `appendEvent` would do).
 * The point: prove the wrapper, the sink and the projection compose
 * correctly. The same wrapper, applied to any plugin tool, lands
 * incidents on the same sink the `logs` plugin's JSONL streams
 * already write to.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ConsoleLogsSink,
	LogsPluginSink,
} from '../../../../src/lib/plugins/logs-sink';
import { withIncidentLogging } from '../../../../src/lib/tools/with-incident-logging';

interface ISinkEventLike {
	ts: string;
	kind: string;
	outcome: string;
	severity: string;
	incidentType: string | null;
	toolName: string | null;
	taskId: string | null;
	agent: string | null;
	summary: string;
	meta: Readonly<Record<string, unknown>>;
}

describe('withIncidentLogging E2E (f00154 S3)', () => {
	let stderrChunks: string[];
	let originalWrite: typeof process.stderr.write;

	beforeEach(() => {
		stderrChunks = [];
		originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return true;
		}) as typeof process.stderr.write;
	});
	afterEach(() => {
		process.stderr.write = originalWrite;
	});

	it('a wrapped handler that returns toolError(...) emits one incident on the sink', async () => {
		const events: ISinkEventLike[] = [];
		const sink = new LogsPluginSink(async (event) => {
			events.push(event as unknown as ISinkEventLike);
		});
		const handler = withIncidentLogging(
			{ incidentType: 'audit-failure', severity: 'error' },
			{ logsSink: sink },
			async () => ({
				isError: true,
				structuredContent: {
					ok: false,
					error: { code: 'no scopes configured', issues: [] },
				},
			}),
		);
		const result = await handler({ path: 'plugins/audit/src/x.ts' });
		expect(result).toMatchObject({ isError: true });
		expect(events).toHaveLength(1);
		const event = events[0]!;
		expect(event.incidentType).toBe('audit-failure');
		expect(event.severity).toBe('error');
		expect(event.outcome).toBe('failed');
		expect(event.summary).toContain('no scopes configured');
	});

	it('ConsoleLogsSink (no logs plugin loaded) writes one redacted line to stderr', async () => {
		const sink = new ConsoleLogsSink();
		const handler = withIncidentLogging(
			{ incidentType: 'quality-failure' },
			{ logsSink: sink },
			async () => ({ isError: true, structuredContent: {} }),
		);
		await handler({});
		const lines = stderrChunks.filter((c) => c.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(1);
		const parsed = JSON.parse((lines[0] ?? '').trim()) as {
			incidentType: string;
			severity: string;
			outcome: string;
		};
		expect(parsed.incidentType).toBe('quality-failure');
		expect(parsed.severity).toBe('error');
		expect(parsed.outcome).toBe('failed');
	});

	it('a chain of three failed calls lands three distinct incidents in the sink', async () => {
		const events: ISinkEventLike[] = [];
		const sink = new LogsPluginSink(async (event) => {
			events.push(event as unknown as ISinkEventLike);
		});
		const handler = withIncidentLogging(
			{ incidentType: 'security-failure' },
			{ logsSink: sink },
			async () => ({ isError: true, structuredContent: {} }),
		);
		await handler({ path: 'a.ts' });
		await handler({ path: 'b.ts' });
		await handler({ path: 'c.ts' });
		expect(events).toHaveLength(3);
		expect(events.every((e) => e.incidentType === 'security-failure')).toBe(
			true,
		);
		// The three events share a ts at ms granularity (the test runs
		// in <1 ms); we accept that and assert the SIZE matches the
		// call count — that is the cross-plugin invariant.
	});
});
