import { describe, expect, it } from 'vitest';

import { ROADMAP_BUMP_AUTHORITY } from '../../../../src/lib/contracts/constants/bump-intent.constant';
import {
	displayProjection,
	renderDisplayProjection,
} from '../../../../src/lib/projection/roadmap-display.service';
import { entry, horizon, roadmapOf } from '../read-model/read-model.fixture';

const roadmap = roadmapOf(
	horizon(
		'0.5.0',
		[
			{
				...entry('a', 'delivered', [
					{ kind: 'path-exists', target: 'a' },
				]),
				estimate: {
					date: '2026-11-01',
					basis: 'two sprints',
					confidence: 'low',
				},
				note: 'internal',
			},
			entry('b', 'in-progress'),
			entry('c', 'dropped'),
		],
		'minor',
	),
);

describe('displayProjection', () => {
	it('shows each horizon with its counts, columns and bump, and no gates or notes', () => {
		const projection = displayProjection('ROADMAP.md', roadmap);
		expect(projection.file).toBe('ROADMAP.md');
		const [shown] = projection.horizons;
		expect(shown?.counts).toEqual({
			total: 3,
			delivered: 1,
			withdrawn: 1,
			open: 1,
		});
		expect(shown?.declared).toEqual(['a', 'b']);
		expect(shown?.delivered).toEqual(['a']);
		expect(shown?.bump).toEqual({
			kind: 'minor',
			authority: ROADMAP_BUMP_AUTHORITY,
			declared: 'minor',
			coherent: true,
		});
		expect(shown?.entries[0]).toEqual({
			id: 'a',
			title: 'Entry a',
			kind: 'feature',
			state: 'delivered',
			estimate: {
				date: '2026-11-01',
				basis: 'two sprints',
				confidence: 'low',
			},
		});
		expect(JSON.stringify(projection)).not.toContain('internal');
		expect(JSON.stringify(projection)).not.toContain('path-exists');
	});

	it('is empty, with no file, for a project that declares no roadmap', () => {
		expect(displayProjection(null, roadmapOf())).toEqual({
			file: null,
			horizons: [],
		});
	});
});

describe('renderDisplayProjection', () => {
	it('gives the same bytes for the same roadmap, tab-indented and newline-ended', () => {
		const once = renderDisplayProjection(
			displayProjection('R.md', roadmap),
		);
		const twice = renderDisplayProjection(
			displayProjection('R.md', roadmap),
		);
		expect(twice).toBe(once);
		expect(once.endsWith('}\n')).toBe(true);
		expect(once).toContain('\n\t"file": "R.md"');
	});
});
