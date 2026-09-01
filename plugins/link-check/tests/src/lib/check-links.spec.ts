import { describe, expect, it } from 'vitest';

import {
	checkLinks,
	extractLinks,
	headingAnchors,
	parseTarget,
	slugify,
} from '../../../src/lib/link-check/check-links';
import type { ISourceDoc } from '../../../src/lib/contracts/interfaces/link-check.interface';

describe('slugify', () => {
	it('lowercases, strips punctuation, hyphenates spaces', () => {
		expect(slugify('My **Bold** Heading!')).toBe('my-bold-heading');
		expect(slugify('§8.2 Host appendix')).toBe('82-host-appendix');
	});

	/**
	 * The one that mattered. Stripping the punctuation leaves the spaces
	 * that surrounded it, and GitHub turns each of them into its own
	 * hyphen. Collapsing the run reported these four as broken anchors
	 * even though GitHub resolves every one of them.
	 */
	it('keeps one hyphen per space, so stripped punctuation doubles it', () => {
		expect(slugify('OpenAPI / Swagger')).toBe('openapi--swagger');
		expect(slugify('Django / DRF')).toBe('django--drf');
		expect(slugify('Rust (Actix-web / Rocket)')).toBe(
			'rust-actix-web--rocket',
		);
		expect(slugify('1. Orient first — one cheap call')).toBe(
			'1-orient-first--one-cheap-call',
		);
	});
});

describe('headingAnchors', () => {
	it('collects heading slugs and dedupes GitHub-style', () => {
		const anchors = headingAnchors(
			['# Intro', '## Setup', '## Setup', '### Done'].join('\n'),
		);
		expect(anchors).toEqual(new Set(['intro', 'setup', 'setup-1', 'done']));
	});

	it('preserves the current anchor extraction on representative markdown', () => {
		const fixture = [
			'# Intro ###',
			'See [doc](./guide.md#part-one "Title") and [self](#intro) and ![img](./img.png)',
			'## Part One ##',
			'[empty]()',
			'```',
			'[fake](./nope.md)',
			'```',
			'### OpenAPI / Swagger ###',
		].join('\n');

		expect([...headingAnchors(fixture)]).toEqual([
			'intro',
			'part-one',
			'openapi--swagger',
		]);
	});

	it('ignores headings inside code fences', () => {
		const anchors = headingAnchors(
			['# Real', '```', '# Fake', '```'].join('\n'),
		);
		expect(anchors).toEqual(new Set(['real']));
	});
});

describe('extractLinks', () => {
	it('extracts links but not images, and skips fenced code', () => {
		const links = extractLinks(
			[
				'see [a](./a.md) and ![img](./x.png)',
				'```',
				'[fake](./nope.md)',
				'```',
				'[b](../b.md#sec "title")',
			].join('\n'),
		);
		expect(links).toEqual([
			{ target: './a.md', line: 1 },
			{ target: '../b.md#sec', line: 5 },
		]);
	});

	it('preserves the current extracted-link output on representative markdown', () => {
		const fixture = [
			'# Intro ###',
			'See [doc](./guide.md#part-one "Title") and [self](#intro) and ![img](./img.png)',
			'## Part One ##',
			'[empty]()',
			'```',
			'[fake](./nope.md)',
			'```',
			'### OpenAPI / Swagger ###',
		].join('\n');

		expect(extractLinks(fixture)).toEqual([
			{ target: './guide.md#part-one', line: 2 },
			{ target: '#intro', line: 2 },
			{ target: '', line: 4 },
		]);
	});

	it('handles long unmatched links and long closing heading runs without backtracking', () => {
		const longSpaces = ' '.repeat(360);
		const longHashes = '#'.repeat(360);

		expect(extractLinks(`[slow](./guide.md${longSpaces}`)).toEqual([]);
		expect([
			...headingAnchors(`# Stable Heading${longSpaces}${longHashes}`),
		]).toEqual(['stable-heading']);
	});
});

describe('parseTarget', () => {
	it('classifies each target kind', () => {
		expect(parseTarget('https://x.com').kind).toBe('external');
		expect(parseTarget('mailto:a@b.c').kind).toBe('external');
		expect(parseTarget('#anchor')).toEqual({
			kind: 'anchor',
			path: '',
			anchor: 'anchor',
		});
		expect(parseTarget('./a.md#sec')).toEqual({
			kind: 'relative',
			path: './a.md',
			anchor: 'sec',
		});
		expect(parseTarget('')).toEqual({
			kind: 'empty',
			path: '',
			anchor: undefined,
		});
	});
});

describe('checkLinks', () => {
	const known = new Set(['docs', 'docs/a.md', 'docs/b.md']);
	const docs: ISourceDoc[] = [
		{
			path: 'docs/a.md',
			content: [
				'# Title',
				'[ok](./b.md)',
				'[gone](./missing.md)',
				'[anchor-ok](./b.md#target)',
				'[anchor-bad](./b.md#nope)',
				'[self](#title)',
				'[self-bad](#ghost)',
				'[empty]()',
				'[ext](https://example.com/404)',
			].join('\n'),
		},
		{ path: 'docs/b.md', content: '# Target\ntext' },
	];

	it('flags broken links, anchors and empty targets; ignores external + valid', () => {
		const findings = checkLinks(docs, known);
		const byRule = (rule: string) =>
			findings.filter((f) => f.ruleId === rule);

		expect(byRule('broken-link')).toHaveLength(1);
		expect(byRule('broken-link')[0]?.message).toContain('docs/missing.md');

		// `#nope` on b.md + `#ghost` on a.md itself.
		expect(byRule('broken-anchor')).toHaveLength(2);
		expect(byRule('empty-link')).toHaveLength(1);

		// The external link and every valid link produce nothing.
		expect(findings).toHaveLength(4);
	});

	it('is clean when every link resolves', () => {
		expect(
			checkLinks(
				[{ path: 'r.md', content: '# H\n[x](#h)' }],
				new Set(['r.md']),
			),
		).toEqual([]);
	});
});
