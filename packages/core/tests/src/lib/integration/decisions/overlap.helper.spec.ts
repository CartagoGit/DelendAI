/**
 * overlap.spec.ts — the footprint of a change, where two overlap, and the
 * groups ready pull requests fall into. Pure: no git, no clock.
 */
import { describe, expect, it } from 'vitest';

import {
	footprintFromReach,
	groupByOverlap,
	overlapBetween,
} from '@delendai/core/lib/integration/decisions/overlap.helper';
import type { IChangeFootprint } from '@delendai/core/lib/integration/decisions/overlap.interface';

const zones = (names: string[], files: string[] = []): IChangeFootprint => ({
	zones: new Set(names),
	files: new Set(files),
});

describe('footprintFromReach', () => {
	it('[<5ms] an empty change reaches nothing', () => {
		const footprint = footprintFromReach({
			files: new Set(),
			reach: undefined,
			creates: false,
		});
		expect(footprint.zones).toEqual(new Set());
	});

	it('[<5ms] a change the selection cannot bound reaches everything', () => {
		const footprint = footprintFromReach({
			files: new Set(['a.ts']),
			reach: undefined,
			creates: false,
		});
		expect(footprint.zones).toBe('everything');
	});

	it('[<5ms] a zone only read reaches the specs that read the file', () => {
		const footprint = footprintFromReach({
			files: new Set(['docs/a.md']),
			reach: {
				zones: new Set(['core']),
				readOnly: new Set(['core']),
				readers: new Map([['core', ['core/a.spec.ts']]]),
			},
			creates: true,
		});
		expect(footprint.readers).toEqual(new Set(['core/a.spec.ts']));
		expect(footprint.creates).toBe(true);
	});
});

describe('groupByOverlap', () => {
	it('[<6ms] separates changes that touch different zones', () => {
		const a = { n: 1, own: zones(['core'], ['x']) };
		const b = { n: 2, own: zones(['web'], ['y']) };
		expect(groupByOverlap([a, b])).toEqual([[a], [b]]);
	});

	it('[<5ms] joins changes through a third one, keeping the order given', () => {
		const a = { n: 1, own: zones(['core']) };
		const b = { n: 2, own: zones(['web']) };
		const c = { n: 3, own: zones(['core', 'web']) };
		expect(groupByOverlap([a, b, c])).toEqual([[a, b, c]]);
	});

	it('[<5ms] one change that reaches everything meets every other', () => {
		const a = { n: 1, own: zones(['core']) };
		const wide: { n: number; own: IChangeFootprint } = {
			n: 2,
			own: { zones: 'everything', files: new Set(['ci.yml']) },
		};
		expect(overlapBetween(a.own, wide.own)).toBeDefined();
		expect(groupByOverlap([a, wide])).toEqual([[a, wide]]);
	});

	it('[<5ms] an empty list has no group', () => {
		expect(groupByOverlap([])).toEqual([]);
	});
});
