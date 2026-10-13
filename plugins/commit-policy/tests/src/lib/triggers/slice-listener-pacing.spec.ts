/**
 * slice-listener-pacing.spec.ts — a poll that was expensive is followed
 * by a rest in proportion, so polling a large tree never holds a core.
 */
import { describe, expect, it } from 'vitest';

import { createPollPacer } from '@delendai/commit-policy/lib/triggers/slice-listener';

describe('createPollPacer', () => {
	it('rests twenty times what the last poll cost', () => {
		let at = 1000;
		const pacer = createPollPacer(() => at);

		const finished = pacer.begin();
		at += 250;
		finished?.();

		// 250 ms of work: five seconds of rest, counted from its end.
		at += 4999;
		expect(pacer.begin()).toBeUndefined();
		at += 1;
		expect(pacer.begin()).toBeTypeOf('function');
	});

	it('never rests after a poll that cost nothing', () => {
		const pacer = createPollPacer(() => 1000);
		pacer.begin()?.();
		expect(pacer.begin()).toBeTypeOf('function');
	});

	it('does not rest for a poll that has not finished', () => {
		let at = 1000;
		const pacer = createPollPacer(() => at);
		pacer.begin();
		at += 60_000;
		expect(pacer.begin()).toBeTypeOf('function');
	});
});
