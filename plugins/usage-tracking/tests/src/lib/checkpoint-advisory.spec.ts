import { describe, expect, it } from 'vitest';

import {
	mapHygieneToCheckpointAdvisory,
	SESSION_TOO_LONG_CODE,
	SessionTooLongAdvisorySource,
} from '../../../src/lib/services/checkpoint-advisory.service';
import {
	DEFAULT_SESSION_HYGIENE_POLICY,
	SessionHygieneMonitor,
} from '../../../src/lib/session-hygiene';
import type { ISessionHygieneAdvisory } from '../../../src/lib/types';

const hygiene = (
	partial: Partial<ISessionHygieneAdvisory> &
		Pick<ISessionHygieneAdvisory, 'newlyBreached' | 'sessionId'>,
): ISessionHygieneAdvisory => ({
	observedMcpOnly: true,
	firstActivityAt: '2026-08-23T10:00:00.000Z',
	lastActivityAt: '2026-08-23T12:01:00.000Z',
	observedElapsedMs: 2 * 60 * 60 * 1000 + 60_000,
	largestIdleGapMs: 0,
	calls: 4,
	responseBytes: 100,
	estimatedMcpOutputTokens: 25,
	reasons: partial.newlyBreached,
	recommendedAction: 'checkpoint-and-compact',
	...partial,
});

describe('mapHygieneToCheckpointAdvisory', () => {
	it('returns null below threshold (no hygiene advisory)', () => {
		expect(mapHygieneToCheckpointAdvisory(null)).toBeNull();
	});

	it('maps session-age alone to recommend + checkpoint-and-fresh-session', () => {
		const advisory = mapHygieneToCheckpointAdvisory(
			hygiene({
				sessionId: 's1',
				newlyBreached: ['session-age'],
			}),
		);
		expect(advisory).toMatchObject({
			triggered: true,
			code: SESSION_TOO_LONG_CODE,
			severity: 'recommend',
			nextAction: 'checkpoint-and-fresh-session',
			dedupeKey: 'SESSION_TOO_LONG:s1:session-age',
		});
		expect(advisory?.message.startsWith('At this point, I recommend')).toBe(
			true,
		);
		expect(advisory?.severity).not.toBe('block');
	});

	it('maps idle-gap alone to checkpoint-and-compact', () => {
		const advisory = mapHygieneToCheckpointAdvisory(
			hygiene({
				sessionId: 's1',
				newlyBreached: ['idle-gap'],
			}),
		);
		expect(advisory?.nextAction).toBe('checkpoint-and-compact');
		expect(advisory?.severity).toBe('recommend');
	});

	it('escalates to strong when several independent reasons breach', () => {
		const advisory = mapHygieneToCheckpointAdvisory(
			hygiene({
				sessionId: 's1',
				newlyBreached: ['mcp-output-volume', 'session-age'],
			}),
		);
		expect(advisory?.severity).toBe('strong');
		expect(advisory?.dedupeKey).toBe(
			'SESSION_TOO_LONG:s1:mcp-output-volume,session-age',
		);
		expect(advisory?.severity).not.toBe('block');
	});
});

describe('SessionTooLongAdvisorySource + SessionHygieneMonitor', () => {
	const policy = {
		...DEFAULT_SESSION_HYGIENE_POLICY,
		maxSessionAgeMs: 60 * 60 * 1000,
		maxIdleGapMs: 24 * 60 * 60 * 1000,
		maxMcpOutputTokens: 100,
	};

	it('emits once on first threshold cross and not on the next identical observe', () => {
		const monitor = new SessionHygieneMonitor(policy);
		const source = new SessionTooLongAdvisorySource();
		expect(
			source.noteHygiene(
				monitor.observe({
					sessionId: 's1',
					at: Date.parse('2026-08-23T10:00:00.000Z'),
					responseBytes: 40,
				}),
			),
		).toBeNull();
		const first = source.noteHygiene(
			monitor.observe({
				sessionId: 's1',
				at: Date.parse('2026-08-23T11:01:00.000Z'),
				responseBytes: 40,
			}),
		);
		expect(first?.code).toBe(SESSION_TOO_LONG_CODE);
		expect(first?.severity).toBe('recommend');
		const second = source.noteHygiene(
			monitor.observe({
				sessionId: 's1',
				at: Date.parse('2026-08-23T11:02:00.000Z'),
				responseBytes: 4,
			}),
		);
		expect(second).toBeNull();
		expect(source.current()?.dedupeKey).toBe(first?.dedupeKey);
	});

	it('escalates when a new independent reason is newly breached', () => {
		const monitor = new SessionHygieneMonitor(policy);
		const source = new SessionTooLongAdvisorySource();
		monitor.observe({
			sessionId: 's1',
			at: Date.parse('2026-08-23T10:00:00.000Z'),
			responseBytes: 40,
		});
		const age = source.noteHygiene(
			monitor.observe({
				sessionId: 's1',
				at: Date.parse('2026-08-23T11:01:00.000Z'),
				responseBytes: 40,
			}),
		);
		expect(age?.severity).toBe('recommend');
		const escalated = source.noteHygiene(
			monitor.observe({
				sessionId: 's1',
				at: Date.parse('2026-08-23T11:02:00.000Z'),
				responseBytes: 400,
			}),
		);
		expect(escalated?.severity).toBe('strong');
		expect(escalated?.dedupeKey).not.toBe(age?.dedupeKey);
		expect(escalated?.reason.length).toBeGreaterThan(0);
	});
});
