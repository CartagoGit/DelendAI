import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBuiltSeo, seoProblems } from '../check-built-seo.ts';

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

describe('checkBuiltSeo [<100ms]', () => {
	it('lists failing pages and skips pagefind and api output [<100ms]', () => {
		const root = mkdtempSync(join(tmpdir(), 'cbs-'));
		mkdirSync(join(root, 'bad'));
		mkdirSync(join(root, 'pagefind'));
		mkdirSync(join(root, 'api'));
		writeFileSync(join(root, 'index.html'), page(1, true, ['en']));
		writeFileSync(join(root, 'bad', 'index.html'), page(0, true, ['en']));
		writeFileSync(join(root, 'pagefind', 'x.html'), '');
		writeFileSync(join(root, 'api', 'x.html'), '');
		writeFileSync(join(root, 'note.txt'), '');
		const r = checkBuiltSeo(root, ['en']);
		expect(r.pages).toBe(2);
		expect(r.failures).toEqual([
			`${join(root, 'bad', 'index.html')}: 0 h1 (want 1)`,
		]);
	});
});
