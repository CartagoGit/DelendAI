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
	extractAgentHint,
	extractFilesHint,
	isErrorOutcome,
	normalizeEvent,
	serializeRedactedEvent,
} from '../src/lib/services/normalize-event';

describe('serializeRedactedEvent truncation (f00111 S2)', () => {
	it('keeps meta.toolName and meta.taskId when the line is truncated', () => {
		const event = normalizeEvent('tool-completed', {
			toolName: 'delendai_agent_catalog',
			taskId: 'delendai_agent_catalog',
			result: { blob: 'x'.repeat(20_000) },
			summary: 'tool-completed: delendai_agent_catalog',
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
		expect(parsed.meta.toolName).toBe('delendai_agent_catalog');
		expect(parsed.meta.taskId).toBe('delendai_agent_catalog');
	});

	it('keeps meta.callId when the line is truncated (the only field that disambiguates concurrent calls to the same tool)', () => {
		const event = normalizeEvent('tool-completed', {
			toolName: 'delendai_agent_catalog',
			taskId: 'delendai_agent_catalog',
			callId: 'call-abc-123',
			result: { blob: 'x'.repeat(20_000) },
			summary: 'tool-completed: delendai_agent_catalog',
		});
		const line = serializeRedactedEvent(event, 8 * 1024);
		const parsed = JSON.parse(line) as {
			meta: { __truncated__?: boolean; callId?: string };
		};
		expect(parsed.meta.__truncated__).toBe(true);
		expect(parsed.meta.callId).toBe('call-abc-123');
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

	it('terminates when the cap is smaller than the attribution envelope', () => {
		const event = normalizeEvent('tool-completed', {
			toolName: 'delendai_agent_catalog',
			taskId: 'task-1',
			result: 'x'.repeat(2_000),
		});
		const parsed = JSON.parse(serializeRedactedEvent(event, 16)) as {
			meta: {
				toolName?: string;
				taskId?: string;
				__truncated__?: boolean;
			};
		};
		expect(parsed.meta.__truncated__).toBe(true);
		expect(parsed.meta.toolName).toBe('delendai_agent_catalog');
		expect(parsed.meta.taskId).toBe('task-1');
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

describe('isErrorOutcome (error-stream routing predicate)', () => {
	it('excludes ok and idle', () => {
		expect(isErrorOutcome('ok')).toBe(false);
		expect(isErrorOutcome('idle')).toBe(false);
	});

	it('includes every other outcome', () => {
		expect(isErrorOutcome('failed')).toBe(true);
		expect(isErrorOutcome('timed-out')).toBe(true);
		expect(isErrorOutcome('cancelled')).toBe(true);
		expect(isErrorOutcome('dead')).toBe(true);
		expect(isErrorOutcome('unknown')).toBe(true);
	});
});

describe('extractAgentHint', () => {
	it('reads agent, then agentName, from the args record', () => {
		expect(extractAgentHint({ agent: 'copilot-a1' })).toBe('copilot-a1');
		expect(extractAgentHint({ agentName: 'copilot-a2' })).toBe(
			'copilot-a2',
		);
		expect(extractAgentHint({ agent: 'a1', agentName: 'a2' })).toBe('a1');
	});

	it('returns null for non-record args or a missing field', () => {
		expect(extractAgentHint(undefined)).toBeNull();
		expect(extractAgentHint('x')).toBeNull();
		expect(extractAgentHint({ toolName: 'x' })).toBeNull();
	});
});

describe('extractFilesHint', () => {
	it('collects files/paths arrays and path/file/filePath singles from args', () => {
		const hint = extractFilesHint(
			{
				files: ['a.ts', 'b.ts'],
				paths: ['c.ts'],
				path: 'd.ts',
				file: 'e.ts',
				filePath: 'f.ts',
			},
			undefined,
		);
		expect(hint).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']);
	});

	it('falls back to the result when args carry no file hint', () => {
		expect(
			extractFilesHint({ toolName: 'x' }, { files: ['found.ts'] }),
		).toEqual(['found.ts']);
	});

	it('dedupes across args and result', () => {
		expect(
			extractFilesHint({ path: 'same.ts' }, { path: 'same.ts' }),
		).toEqual(['same.ts']);
	});

	it('returns an empty array when nothing matches', () => {
		expect(extractFilesHint({ toolName: 'x' }, undefined)).toEqual([]);
	});
});
