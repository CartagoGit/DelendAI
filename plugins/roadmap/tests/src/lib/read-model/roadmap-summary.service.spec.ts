import { describe, expect, it } from 'vitest';

import {
	entryDetail,
	summariseRoadmap,
} from '../../../../src/lib/read-model/roadmap-summary.service';
import { entry, horizon, roadmapOf } from './read-model.fixture';

const roadmap = roadmapOf(
	horizon(
		'0.5.0',
		[
			entry('a', 'delivered', [{ kind: 'path-exists', target: 'x' }]),
			entry('b', 'in-progress'),
			entry('c', 'dropped'),
		],
		'minor',
	),
	horizon('0.6.0', [entry('d', 'proposed')]),
);

describe('summariseRoadmap', () => {
	it('counts each horizon and lists its entries without their gates', () => {
		const [first, second] = summariseRoadmap(roadmap);
		expect(first?.counts).toEqual({
			total: 3,
			delivered: 1,
			withdrawn: 1,
			open: 1,
		});
		expect(first?.bumpHint).toBe('minor');
		expect(first?.entries[0]).toEqual({
			id: 'a',
			title: 'Entry a',
			kind: 'feature',
			state: 'delivered',
		});
		expect(second && 'bumpHint' in second).toBe(false);
	});

	it('keeps to one version when asked', () => {
		expect(
			summariseRoadmap(roadmap, '0.6.0').map((h) => h.version),
		).toEqual(['0.6.0']);
		expect(summariseRoadmap(roadmap, '9.9.9')).toEqual([]);
	});
});

describe('entryDetail', () => {
	it('returns the whole entry and the version that holds it', () => {
		const detail = entryDetail(roadmap, 'a');
		expect(detail?.version).toBe('0.5.0');
		expect(detail?.entry.gates).toHaveLength(1);
	});

	it('returns nothing for an id no horizon holds', () => {
		expect(entryDetail(roadmap, 'zz')).toBeUndefined();
	});
});
