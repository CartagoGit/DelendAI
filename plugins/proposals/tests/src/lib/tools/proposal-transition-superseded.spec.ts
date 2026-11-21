/**
 * proposal-transition-superseded.spec.ts — the typed `superseded_by` leads
 * the reason, the form every reader of an old record still parses.
 */
import { describe, expect, it } from 'vitest';

import { PROPOSAL_TRANSITION_INPUT_SCHEMA } from '@delendai/proposals/lib/contracts/proposal-transition-input.contract';
import { withSupersededReason } from '@delendai/proposals/lib/tools/proposal-transition.tool';

const base = { id: 'x00001', to: 'retired', reason: 'done elsewhere' } as const;

describe('withSupersededReason', () => {
	it('[<10ms] leaves the arguments alone without superseded_by', () => {
		expect(withSupersededReason(base)).toBe(base);
	});

	it('[<10ms] leads the reason with the superseding id and drops the field', () => {
		expect(
			withSupersededReason({ ...base, superseded_by: 'f00822' }),
		).toEqual({ ...base, reason: 'superseded_by f00822: done elsewhere' });
	});

	it('[<10ms] keeps a reason that already leads with it', () => {
		const reason = 'superseded_by f00822: same work';
		expect(
			withSupersededReason({ ...base, reason, superseded_by: 'f00822' }),
		).toEqual({ ...base, reason });
	});

	it('[<10ms] accepts an optional proposal id and refuses anything else', () => {
		const parse = (extra: object) =>
			PROPOSAL_TRANSITION_INPUT_SCHEMA.safeParse({ ...base, ...extra })
				.success;
		expect(parse({})).toBe(true);
		expect(parse({ superseded_by: 'f00822' })).toBe(true);
		expect(parse({ superseded_by: 'not an id' })).toBe(false);
	});
});
