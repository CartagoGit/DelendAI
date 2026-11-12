import { EMPTY_FOLD } from '../../src/lib/projector/contracts/constants/work-progress.constant';
import { describe, expect, it } from 'vitest';

import type { IPhaseRule } from '../../src/lib/projector/contracts/interfaces/work-progress.interface';
import { phaseRank } from '../../src/lib/projector/phase-inference.service';
import {
	makeEvent,
	randomEvents,
} from '../../src/lib/projector/test-support.helper';
import { foldEvent } from '../../src/lib/projector/work-progress-snapshot.service';

/** The invariant the ratchet guards: no event may lower the phase rank. */
const phaseNeverDrops = (rules: readonly IPhaseRule[] | undefined): boolean => {
	const options = rules === undefined ? {} : { rules };
	for (let seed = 1; seed <= 50; seed++) {
		let fold = EMPTY_FOLD;
		for (const event of randomEvents(seed, 100, ['p/S1'])) {
			const next = foldEvent(fold, event, options);
			if (next.phaseRank < fold.phaseRank) return false;
			fold = next;
		}
	}
	return true;
};

describe('projector ratchet', () => {
	it('holds for the default rules', () => {
		expect(phaseNeverDrops(undefined)).toBe(true);
	});

	it('holds when a caller prepends a rule that points backwards', () => {
		expect(
			phaseNeverDrops([{ kind: 'tool_called', phase: 'investigating' }]),
		).toBe(true);
	});

	it('would fail if the fold rewound the phase to the latest event', () => {
		// A deliberately broken fold: take the implied rank instead of the max.
		const rewind = (ranks: readonly number[]): boolean =>
			ranks.every(
				(rank, i) => i === 0 || rank >= (ranks[i - 1] as number),
			);
		const implied = [phaseRank('implementing'), phaseRank('investigating')];
		expect(rewind(implied)).toBe(false);
		const kinds = ['git_change', 'tool_called'] as const;
		let folded = EMPTY_FOLD;
		for (const [i, kind] of kinds.entries())
			folded = foldEvent(folded, makeEvent('p/S1', kind, i + 1));
		expect(folded.phaseRank).toBe(phaseRank('implementing'));
	});
});
