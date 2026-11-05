/**
 * slice-sections.service.spec.ts — a reviewer is handed the sections it
 * judges, not the whole proposal.
 */
import { describe, expect, it } from 'vitest';

import { sliceSections } from './slice-sections.service';

const doc = [
	'# x00001 — a plan',
	'## slices',
	'### S1 — done long ago',
	'- **Status**: done',
	'### S2 — waits for a verdict',
	'- **Status**: review',
	'- Delivered: the thing.',
	'### S10 — another one',
	'- **Status**: review',
	'## acceptance',
	'- everything',
].join('\n');

describe('sliceSections', () => {
	it('returns each asked slice up to the next heading, and nothing of the others', () => {
		const sections = sliceSections(doc, ['S2', 'S10']);
		expect(sections.S2).toBe(
			'### S2 — waits for a verdict\n- **Status**: review\n- Delivered: the thing.',
		);
		expect(sections.S10).toBe(
			'### S10 — another one\n- **Status**: review',
		);
		expect(Object.keys(sections)).toEqual(['S2', 'S10']);
	});

	it('does not take S1 for S10, nor invent a slice the document lacks', () => {
		const sections = sliceSections(doc, ['S1', 'S9']);
		expect(sections.S1).toBe('### S1 — done long ago\n- **Status**: done');
		expect(sections.S9).toBeUndefined();
	});
});
