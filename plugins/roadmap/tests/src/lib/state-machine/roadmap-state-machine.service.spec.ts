import { describe, expect, it } from 'vitest';

import { ROADMAP_ENTRY_STATES } from '../../../../src/lib/contracts/constants/roadmap.constant';
import {
	checkTransition,
	legalTransitions,
} from '../../../../src/lib/state-machine/roadmap-state-machine.service';

describe('roadmap state machine', () => {
	it('allows a forward move', () => {
		expect(checkTransition('proposed', 'committed')).toEqual({
			ok: true,
			value: 'committed',
		});
	});

	it('returns a reason, not an exception, for an illegal move', () => {
		const result = checkTransition('proposed', 'delivered');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain('from proposed it can move to');
		}
	});

	it('treats delivered, dropped and superseded as endings', () => {
		for (const ending of ['delivered', 'dropped', 'superseded'] as const) {
			expect(legalTransitions(ending)).toEqual([]);
			const result = checkTransition(ending, 'proposed');
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toContain('is an ending');
		}
	});

	it('lets a deferred entry be taken up again', () => {
		expect(checkTransition('deferred', 'committed').ok).toBe(true);
	});

	it('says so when nothing would change', () => {
		const result = checkTransition('committed', 'committed');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('already committed');
	});

	it('only ever moves to a known state', () => {
		for (const from of ROADMAP_ENTRY_STATES) {
			for (const to of legalTransitions(from)) {
				expect(ROADMAP_ENTRY_STATES).toContain(to);
			}
		}
	});
});
