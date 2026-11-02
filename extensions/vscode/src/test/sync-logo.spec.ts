/**
 * sync-logo.spec.ts — the monochrome mark is one colour, and not the
 * colour mark under another name.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { monochromeProblems } from '../../scripts/sync-logo';

const brand = (name: string): string =>
	readFileSync(
		resolve(import.meta.dirname, '../../../../apps/shared/brand', name),
		'utf8',
	);

describe('the monochrome logo', () => {
	it('is the authored mark: one colour, no gradient, not the colour file', () => {
		expect(
			monochromeProblems(brand('logo-mono.svg'), brand('logo.svg')),
		).toEqual([]);
	});

	it('names what makes a mark not monochrome', () => {
		const colour = brand('logo.svg');
		const problems = monochromeProblems(colour, colour);
		expect(problems).toContain('it is the colour mark, byte for byte');
		expect(problems).toContain('it defines a gradient');
		expect(problems.some((each) => each.includes('url(#mc)'))).toBe(true);
		expect(
			monochromeProblems('<path fill="#000" stroke="none"/>', colour),
		).toEqual(['it paints with #000, not only currentColor']);
	});
});
