/**
 * start-clock.spec.ts — FIFO pairing of onToolStart with onToolCall.
 */
import { describe, expect, it } from 'vitest';

import { StartClock } from '../../../src/lib/start-clock';

describe('StartClock', () => {
	it('pairs a start with the next completion of the same tool', () => {
		const clock = new StartClock();
		clock.begin('t', 100);
		expect(clock.take('t')).toBe(100);
		expect(clock.take('t')).toBeUndefined();
	});

	it('pairs concurrent same-tool calls FIFO', () => {
		const clock = new StartClock();
		clock.begin('t', 10);
		clock.begin('t', 20);
		expect(clock.take('t')).toBe(10);
		expect(clock.take('t')).toBe(20);
		expect(clock.pendingCount).toBe(0);
	});

	it('returns undefined for an unmatched completion', () => {
		const clock = new StartClock();
		expect(clock.take('never-started')).toBeUndefined();
	});

	it('keeps per-tool queues independent', () => {
		const clock = new StartClock();
		clock.begin('a', 1);
		clock.begin('b', 2);
		expect(clock.take('b')).toBe(2);
		expect(clock.take('a')).toBe(1);
	});
});
