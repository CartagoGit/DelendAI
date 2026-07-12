/**
 * normalize-event.spec.ts — f00111 S2.
 *
 * Truncation must not destroy attribution (the porra "10 hangs" were
 * truncated completions whose meta.toolName vanished), and the new
 * `server-started` / `tool-cancelled` kinds normalize with sane
 * outcomes.
 */
import { describe, expect, it } from 'vitest';

import {
	normalizeEvent,
	serializeRedactedEvent,
} from '../src/lib/services/normalize-event';

describe('serializeRedactedEvent truncation (f00111 S2)', () => {
	it('keeps meta.toolName and meta.taskId when the line is truncated', () => {
		const event = normalizeEvent('tool-completed', {
			toolName: 'mcp-vertex_agent_catalog',
			taskId: 'mcp-vertex_agent_catalog',
			result: { blob: 'x'.repeat(20_000) },
			summary: 'tool-completed: mcp-vertex_agent_catalog',
		});
		const line = serializeRedactedEvent(event, 8 * 1024);
		expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(8 * 1024);
		const parsed = JSON.parse(line) as {
			meta: {
				__truncated__?: boolean;
				toolName?: string;
				taskId?: string;
			};
		};
		expect(parsed.meta.__truncated__).toBe(true);
		expect(parsed.meta.toolName).toBe('mcp-vertex_agent_catalog');
		expect(parsed.meta.taskId).toBe('mcp-vertex_agent_catalog');
	});

	it('leaves small lines untouched', () => {
		const event = normalizeEvent('tool-completed', {
			toolName: 't',
			summary: 'tool-completed: t',
		});
		const parsed = JSON.parse(serializeRedactedEvent(event)) as {
			meta: { __truncated__?: boolean; toolName?: string };
		};
		expect(parsed.meta.__truncated__).toBeUndefined();
		expect(parsed.meta.toolName).toBe('t');
	});
});

describe('new event kinds (f00111 S2)', () => {
	it('normalizes server-started with outcome ok', () => {
		const event = normalizeEvent('server-started', {
			taskId: 'pid-123',
			pid: 123,
			workspace: '/ws',
			summary: 'server-started: pid 123 @ /ws',
		});
		expect(event.kind).toBe('server-started');
		expect(event.outcome).toBe('ok');
		expect(event.taskId).toBe('pid-123');
	});

	it('normalizes tool-cancelled with outcome cancelled', () => {
		const event = normalizeEvent('tool-cancelled', {
			toolName: 'spec_slow',
			taskId: 'spec_slow',
			elapsedMs: 42,
			summary: 'tool-cancelled: spec_slow after 42ms',
		});
		expect(event.kind).toBe('tool-cancelled');
		expect(event.outcome).toBe('cancelled');
		expect(event.meta.elapsedMs).toBe(42);
	});
});
