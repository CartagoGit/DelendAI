/**
 * timeline.spec.ts — f00192 (Track J / agent timeline).
 *
 * Pins the host-agnostic timeline contract:
 *   - append() redacts free-text fields at the boundary,
 *   - the buffer is a ring (oldest dropped at capacity),
 *   - serialize/deserialize round-trip through JSON,
 *   - the on-disk schema is versioned and parsed safely,
 *   - the pure helpers (redactFreeText, formatEventTimestamp,
 *     isTimelineLog, mergeTimelineLogs) behave as advertised.
 *
 * Privacy (R1.1): the test suite explicitly asserts that tool
 * names and URLs are NEVER present in the persisted log.
 */

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MAX_EVENTS,
	TimelineBuffer,
	formatEventTimestamp,
	isTimelineLog,
	mergeTimelineLogs,
	nowEvent,
	redactFreeText,
	truncateRedactor,
	type ITimelineLog,
} from '@delendai/core/public';

describe('f00192 — observability.timeline (Track J)', () => {
	describe('redactFreeText (R1.1)', () => {
		it('strips tool-name-like tokens', () => {
			expect(
				redactFreeText('called acme.sendMessage and vscode.openFile'),
			).toBe('called <tool> and <tool>');
		});

		it('strips URLs', () => {
			expect(
				redactFreeText('see https://api.example.com/foo for details'),
			).toBe('see <url> for details');
		});

		it('strips tool names AND URLs in one pass', () => {
			expect(
				redactFreeText(
					'failed to call acme.sendMessage on https://api.acme.com/v1',
				),
			).toBe('failed to call <tool> on <url>');
		});

		it('collapses whitespace', () => {
			expect(redactFreeText('a\n\n\tb   c')).toBe('a b c');
		});

		it('returns empty input unchanged', () => {
			expect(redactFreeText('')).toBe('');
		});
	});

	describe('truncateRedactor', () => {
		it('truncates long strings with an ellipsis', () => {
			const r = truncateRedactor(10);
			expect(r('a'.repeat(50))).toBe('aaaaaaa...');
		});

		it('passes short strings through unchanged (after redaction)', () => {
			const r = truncateRedactor(100);
			expect(r('hello acme.sendMessage')).toBe('hello <tool>');
		});
	});

	describe('formatEventTimestamp', () => {
		it('formats an ISO timestamp as UTC YYYY-MM-DD HH:MM:SS', () => {
			expect(formatEventTimestamp('2026-08-26T14:09:08.123Z')).toBe(
				'2026-08-26 14:09:08',
			);
		});

		it('passes through invalid input unchanged', () => {
			expect(formatEventTimestamp('not-a-date')).toBe('not-a-date');
		});
	});

	describe('TimelineBuffer', () => {
		it('appends an event and returns the redacted copy', () => {
			const buf = new TimelineBuffer();
			const stored = buf.append({
				ts: '2026-08-26T00:00:00Z',
				kind: 'claim',
				plugin: 'proposals',
				sliceId: 'q00006-track-j',
				why: 'claimed via acme.claimSlice',
			});
			expect(stored.kind).toBe('claim');
			expect(stored.why).toBe('claimed via <tool>');
			expect(buf.size).toBe(1);
		});

		it('keeps the log bounded at the configured capacity (ring buffer)', () => {
			const buf = new TimelineBuffer({ maxEvents: 3 });
			for (let i = 0; i < 5; i += 1) {
				buf.append({
					ts: `2026-08-26T00:00:0${i}Z`,
					kind: 'note',
				});
			}
			expect(buf.size).toBe(3);
			// The two oldest should have been dropped.
			const snap = buf.snapshot();
			expect(snap.events[0]?.ts).toBe('2026-08-26T00:00:02Z');
			expect(snap.events[2]?.ts).toBe('2026-08-26T00:00:04Z');
		});

		it('filters by kind', () => {
			const buf = new TimelineBuffer();
			buf.append({ ts: '2026-08-26T00:00:00Z', kind: 'claim' });
			buf.append({ ts: '2026-08-26T00:00:01Z', kind: 'test' });
			buf.append({ ts: '2026-08-26T00:00:02Z', kind: 'commit' });
			buf.append({ ts: '2026-08-26T00:00:03Z', kind: 'test' });
			const tests = buf.filterByKind(['test']);
			expect(tests).toHaveLength(2);
			expect(tests.every((e) => e.kind === 'test')).toBe(true);
		});

		it('filters by plugin', () => {
			const buf = new TimelineBuffer();
			buf.append({
				ts: '2026-08-26T00:00:00Z',
				kind: 'claim',
				plugin: 'alpha',
			});
			buf.append({
				ts: '2026-08-26T00:00:01Z',
				kind: 'claim',
				plugin: 'beta',
			});
			expect(buf.filterByPlugin('alpha')).toHaveLength(1);
			expect(buf.filterByPlugin('beta')).toHaveLength(1);
			expect(buf.filterByPlugin('gamma')).toHaveLength(0);
		});

		it('rejects events missing kind or ts', () => {
			const buf = new TimelineBuffer();
			expect(() =>
				buf.append({
					ts: '2026-08-26T00:00:00Z',
					kind: undefined as unknown as 'note',
				}),
			).toThrow(/requires \{ kind, ts \}/);
		});

		it('serialize/deserialize round-trips through JSON', () => {
			const buf = new TimelineBuffer();
			buf.append({
				ts: '2026-08-26T00:00:00Z',
				kind: 'cost',
				plugin: 'auto-agent-selector',
				cost: 1234,
				why: 'routed through acme.route',
			});
			const json = buf.serialize();
			const parsed = TimelineBuffer.deserialize(json);
			expect(parsed.version).toBe(1);
			expect(parsed.events).toHaveLength(1);
			expect(parsed.events[0]?.why).toBe('routed through <tool>');
		});

		it('deserialize refuses malformed JSON', () => {
			expect(() => TimelineBuffer.deserialize('{')).toThrow(
				/invalid JSON/,
			);
			expect(() => TimelineBuffer.deserialize('{"events":[]}')).toThrow(
				/schema mismatch/,
			);
			expect(() =>
				TimelineBuffer.deserialize(
					JSON.stringify({ version: 2, events: [] }),
				),
			).toThrow(/schema mismatch/);
		});

		it('isTimelineLog accepts only the canonical shape', () => {
			expect(isTimelineLog({ version: 1, events: [] })).toBe(true);
			expect(
				isTimelineLog({
					version: 1,
					events: [{ ts: 'x', kind: 'note' }],
				}),
			).toBe(true);
			expect(isTimelineLog({ version: 2, events: [] })).toBe(false);
			expect(isTimelineLog({ version: 1 })).toBe(false);
			expect(isTimelineLog(null)).toBe(false);
			expect(isTimelineLog(undefined)).toBe(false);
		});

		it('clear() empties the buffer', () => {
			const buf = new TimelineBuffer();
			buf.append({ ts: '2026-08-26T00:00:00Z', kind: 'note' });
			buf.clear();
			expect(buf.size).toBe(0);
		});
	});

	describe('mergeTimelineLogs', () => {
		it('deduplicates by ts|kind|plugin|sliceId and sorts by ts', () => {
			const left: ITimelineLog = {
				version: 1,
				events: [
					{ ts: '2026-08-26T00:00:01Z', kind: 'claim', plugin: 'a' },
					{ ts: '2026-08-26T00:00:03Z', kind: 'commit', plugin: 'a' },
				],
			};
			const right: ITimelineLog = {
				version: 1,
				events: [
					{ ts: '2026-08-26T00:00:02Z', kind: 'test', plugin: 'a' },
					{ ts: '2026-08-26T00:00:03Z', kind: 'commit', plugin: 'a' }, // dup
				],
			};
			const merged = mergeTimelineLogs(left, right);
			expect(merged.events.map((e) => e.ts)).toEqual([
				'2026-08-26T00:00:01Z',
				'2026-08-26T00:00:02Z',
				'2026-08-26T00:00:03Z',
			]);
		});
	});

	describe('nowEvent', () => {
		it('stamps the event with the current ISO timestamp', () => {
			const before = Date.now();
			const event = nowEvent('note', { plugin: 'p' });
			const after = Date.now();
			const eventMs = new Date(event.ts).getTime();
			expect(eventMs).toBeGreaterThanOrEqual(before);
			expect(eventMs).toBeLessThanOrEqual(after);
			expect(event.kind).toBe('note');
			expect(event.plugin).toBe('p');
		});
	});

	describe('DEFAULT_MAX_EVENTS', () => {
		it('is 500 by default', () => {
			expect(DEFAULT_MAX_EVENTS).toBe(500);
		});
	});
});
