import { describe, expect, it } from 'vitest';

import { createWorkProgressService } from '../../src/lib/projector/work-progress-api.service';
import { randomEvents } from '../../src/lib/projector/test-support.helper';

/** 50 sequences of 100 events, as the proposal asks; the SQLite shadow does not exist, so only the in-memory path is covered. */
const SEQUENCES = 50;
const LENGTH = 100;
const ITEMS = ['p/S1', 'p/S2', 'p/S3', 'q/S1'];

describe('incremental equals clean rebuild (service level)', () => {
	it('matches for every sequence, appended in uneven chunks', () => {
		for (let seed = 1; seed <= SEQUENCES; seed++) {
			const events = randomEvents(seed * 31, LENGTH, ITEMS);
			const incremental = createWorkProgressService({ now: () => 0 });
			incremental.load([], []);
			for (let at = 0; at < LENGTH; at += 1 + (at % 9)) {
				incremental.append(events.slice(at, at + 1 + (at % 9)));
			}
			const rebuilt = createWorkProgressService({ now: () => 0 });
			rebuilt.load(events, []);
			for (const id of ITEMS)
				expect(incremental.getSnapshot(id)).toEqual(
					rebuilt.getSnapshot(id),
				);
		}
	});
});
