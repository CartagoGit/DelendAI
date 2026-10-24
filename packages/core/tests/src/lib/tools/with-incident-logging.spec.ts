/**
 * with-incident-logging.spec.ts — f00154 S3.
 *
 * Unit tests for the `withIncidentLogging` adapter: verifies the
 * wrapper emits one incident per failed call, with the right
 * severity/incidentType, while leaving the success path untouched.
 * The test is read-only — no ILogStore mocks, no plugin boots.
 */
import { describe, expect, it } from 'vitest';

import type { IIncidentLoggingContext } from '../../../../src/lib/tools/with-incident-logging';
import type {
	ILogsSink,
	ISinkEvent,
} from '../../../../src/lib/plugins/plugin-contract';
import {
	emitIncident,
	withIncidentLogging,
} from '../../../../src/lib/tools/with-incident-logging';

class MockSink implements ILogsSink {
	readonly id = 'mock';
	events: ISinkEvent[] = [];
	async record(event: ISinkEvent): Promise<void> {
		this.events.push(event);
	}
}

describe('withIncidentLogging (f00154 S3)', () => {
	it('returns the success result untouched and does NOT emit', async () => {
		const sink = new MockSink();
		const handler = withIncidentLogging(
			{ incidentType: 'audit-failure' },
			{ logsSink: sink },
			async (_args: { ok: boolean }) => ({
				structuredContent: { ok: true },
			}),
		);
		const result = await handler({ ok: true });
		expect(result).toEqual({ structuredContent: { ok: true } });
		expect(sink.events).toHaveLength(0);
	});

	it('emits one incident when the result is isError: true', async () => {
		const sink = new MockSink();
		const handler = withIncidentLogging(
			{ incidentType: 'audit-failure' },
			{ logsSink: sink },
			async (_args: { path: string }) => ({
				isError: true,
				structuredContent: {
					ok: false,
					error: { code: 'no scopes configured', issues: [] },
				},
			}),
		);
		const result = await handler({ path: 'plugins/audit/src/x.ts' });
		// The original error result is returned untouched.
		expect(result).toMatchObject({ isError: true });
		expect(sink.events).toHaveLength(1);
		const event = sink.events[0]!;
		expect(event.severity).toBe('error');
		expect(event.incidentType).toBe('audit-failure');
		expect(event.outcome).toBe('failed');
		expect(event.summary).toContain('no scopes configured');
	});

	it('respects the per-tool severity override', async () => {
		const sink = new MockSink();
		const handler = withIncidentLogging(
			{ incidentType: 'tool-failure', severity: 'critical' },
			{ logsSink: sink },
			async () => ({ isError: true, structuredContent: {} }),
		);
		await handler({});
		expect(sink.events[0]?.severity).toBe('critical');
		expect(sink.events[0]?.outcome).toBe('failed');
	});

	it('is a no-op when no logsSink is supplied', async () => {
		const handler = withIncidentLogging(
			{ incidentType: 'tool-failure' },
			{} as IIncidentLoggingContext,
			async () => ({ isError: true, structuredContent: {} }),
		);
		// The handler must not throw when there is no sink; the error
		// still reaches the caller.
		const result = await handler({});
		expect(result).toMatchObject({ isError: true });
	});

	it('extracts the agent from the args', async () => {
		const sink = new MockSink();
		const handler = withIncidentLogging(
			{ incidentType: 'quality-failure' },
			{ logsSink: sink },
			async () => ({ isError: true, structuredContent: {} }),
		);
		await handler({ agent: 'peer-1', path: 'foo.ts' });
		expect(sink.events[0]?.agent).toBe('peer-1');
	});

	it('swallows sink failures (the tool result is still returned)', async () => {
		const failingSink: ILogsSink = {
			id: 'fail',
			record: async () => {
				throw new Error('disk full');
			},
		};
		const handler = withIncidentLogging(
			{ incidentType: 'tool-failure' },
			{ logsSink: failingSink },
			async () => ({ isError: true, structuredContent: {} }),
		);
		// Must not throw.
		const result = await handler({});
		expect(result).toMatchObject({ isError: true });
	});
});

describe('emitIncident (f00154 S3)', () => {
	it('emits one incident when result is isError: true and sink is present', async () => {
		const sink = new MockSink();
		await emitIncident(
			sink,
			{ incidentType: 'security-failure' },
			'delendai_security_secrets',
			{ path: 'src/x.ts' },
			{
				isError: true,
				structuredContent: { ok: false, error: { code: 'x' } },
			},
		);
		expect(sink.events).toHaveLength(1);
		expect(sink.events[0]?.incidentType).toBe('security-failure');
		expect(sink.events[0]?.summary).toContain('x');
	});

	it('does not emit on success results', async () => {
		const sink = new MockSink();
		await emitIncident(
			sink,
			{ incidentType: 'security-failure' },
			'delendai_security_secrets',
			{ path: 'src/x.ts' },
			{ isError: false, structuredContent: { ok: true } },
		);
		expect(sink.events).toHaveLength(0);
	});
});
