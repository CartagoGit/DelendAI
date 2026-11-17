import { describe, expect, it } from 'vitest';
import { seoProblems } from '../check-built-seo.ts';

const page = (
	h1s: number,
	canonical: boolean,
	langs: readonly string[],
): string =>
	[
		canonical ? '<link rel="canonical" href="https://x/">' : '',
		...langs.map(
			(l) =>
				`<link rel="alternate" hreflang="${l}" href="https://x/${l}/">`,
		),
		...Array.from({ length: h1s }, () => '<h1>t</h1>'),
	].join('');

describe('seoProblems', () => {
	it('accepts one h1, a canonical and every hreflang [<20ms]', () => {
		expect(seoProblems(page(1, true, ['en', 'es']), ['en', 'es'])).toEqual(
			[],
		);
	});
	it('reports a second h1 [<20ms]', () => {
		expect(seoProblems(page(2, true, ['en']), ['en'])).toEqual([
			'2 h1 (want 1)',
		]);
	});
	it('reports a missing canonical and a missing locale [<20ms]', () => {
		expect(seoProblems(page(1, false, ['en']), ['en', 'es'])).toEqual([
			'no canonical',
			'no hreflang es',
		]);
	});
	it('skips redirect stubs [<20ms]', () => {
		expect(
			seoProblems('<meta http-equiv="refresh" content="0">', ['en']),
		).toEqual([]);
	});
});
