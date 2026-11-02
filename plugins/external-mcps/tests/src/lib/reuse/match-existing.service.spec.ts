import { describe, expect, it } from 'vitest';

import {
	matchExisting,
	wordsOf,
} from '../../../../src/lib/reuse/match-existing.service';

describe('matchExisting', () => {
	it('reads the words of any naming style', () => {
		expect([...wordsOf('PrimaryButton')]).toEqual(['primary', 'button']);
		expect([...wordsOf('primary-button.component')]).toEqual([
			'primary',
			'button',
		]);
	});

	it('reports existing components the description may already be, best first', () => {
		expect(
			matchExisting('Primary Button', [
				'src/app/ui/button.component.ts',
				'src/app/ui/primary-button.component.ts',
				'src/app/ui/card.component.ts',
			]),
		).toEqual([
			{ path: 'src/app/ui/primary-button.component.ts', similarity: 1 },
			{ path: 'src/app/ui/button.component.ts', similarity: 0.5 },
		]);
		expect(matchExisting('', ['a.tsx'])).toEqual([]);
	});
});
