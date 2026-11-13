import { describe, expect, it } from 'vitest';

import {
	buildScaffold,
	buildScaffoldFileName,
	collisionSuffix,
	parseScaffold,
	serializeScaffold,
	slugify,
} from '../../../src/lib/issue-scaffold';
import type {
	IGithubComment,
	IGithubIssueDetail,
} from '../../../src/lib/contracts/issue.types';

const issueDetail: IGithubIssueDetail = {
	number: 123,
	title: 'Something is Broken!',
	state: 'open',
	labels: ['bug', 'p1'],
	author: 'octocat',
	url: 'https://github.com/o/r/issues/123',
	createdAt: '2026-06-21T00:00:00.000Z',
	updatedAt: '2026-06-21T01:00:00.000Z',
	commentsCount: 1,
	body: 'It crashes when I click the button. token=AKIAABCDEFGHIJKLMNOP',
	comments: [],
};

const comments: readonly IGithubComment[] = [
	{
		author: 'reviewer',
		body: 'Can confirm, here is my password: hunter12345678',
		createdAt: '2026-06-21T02:00:00.000Z',
		url: 'https://github.com/o/r/issues/123#comment-1',
	},
];

describe('slugify', async () => {
	it('lowercases, strips punctuation and hyphenates', async () => {
		expect(slugify('Something is Broken!')).toBe('something-is-broken');
	});

	it('falls back to "untitled" for a title with no alphanumeric chars', async () => {
		expect(slugify('!!!')).toBe('untitled');
	});
});

describe('collisionSuffix', async () => {
	it('is deterministic for the same issue number', async () => {
		expect(collisionSuffix(123)).toBe(collisionSuffix(123));
		expect(collisionSuffix(123)).toHaveLength(4);
	});

	it('differs across issue numbers (no accidental collision in this test set)', async () => {
		expect(collisionSuffix(123)).not.toBe(collisionSuffix(124));
	});
});

describe('buildScaffoldFileName', async () => {
	it('builds the canonical name with no collision', async () => {
		expect(buildScaffoldFileName(123, 'Something is Broken!')).toBe(
			'github#123-something-is-broken.md',
		);
	});

	it('appends a deterministic hash suffix when the base name already exists', async () => {
		const base = 'github#123-something-is-broken.md';
		const withSuffix = buildScaffoldFileName(
			123,
			'Something is Broken!',
			new Set([base]),
		);
		expect(withSuffix).toBe(
			`github#123-something-is-broken-${collisionSuffix(123)}.md`,
		);
		expect(withSuffix).not.toBe(base);
	});
});

describe('buildScaffold', async () => {
	it('builds a scaffold with pending resolution and ingested status', async () => {
		const scaffold = buildScaffold(issueDetail, comments);
		expect(scaffold.frontmatter.source).toBe('github');
		expect(scaffold.frontmatter.source_id).toBe(123);
		expect(scaffold.frontmatter.status).toBe('ingested');
		expect(scaffold.frontmatter.resolution).toBe('pending');
		expect(scaffold.frontmatter.proposals).toEqual([]);
		expect(scaffold.body).toContain('# Something is Broken!');
	});

	it('redacts secrets from the issue body before they reach the scaffold', async () => {
		const scaffold = buildScaffold(issueDetail, comments);
		expect(scaffold.body).not.toContain('AKIAABCDEFGHIJKLMNOP');
		expect(scaffold.body).toContain('[REDACTED]');
	});

	it('redacts secrets from comment bodies before they reach the frontmatter', async () => {
		const scaffold = buildScaffold(issueDetail, comments);
		expect(scaffold.frontmatter.comments[0]?.body).not.toContain(
			'hunter12345678',
		);
		expect(scaffold.frontmatter.comments[0]?.body).toContain('[REDACTED]');
	});

	it('renders "(none)" in the body header when the issue has no labels', async () => {
		const scaffold = buildScaffold({ ...issueDetail, labels: [] }, []);
		expect(scaffold.body).toContain('> Labels: (none)');
	});
});

describe('serializeScaffold + parseScaffold round-trip', async () => {
	it('round-trips a built scaffold through serialize/parse', async () => {
		const scaffold = buildScaffold(issueDetail, comments);
		const serialized = serializeScaffold(scaffold);
		expect(serialized.startsWith('---\n')).toBe(true);

		const parsed = parseScaffold(serialized);
		expect(parsed.frontmatter).toEqual(scaffold.frontmatter);
		expect(parsed.body.trim()).toBe(scaffold.body.trim());
	});

	it('throws when parsing a file with no frontmatter block', async () => {
		expect(() => parseScaffold('# no frontmatter here')).toThrow(
			/no frontmatter block/,
		);
	});
});
