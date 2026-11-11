import { describe, expect, it } from 'vitest';

import {
	extractFrontmatterBlock,
	parseFrontmatterBlock,
	serializeFrontmatterBlock,
	splitFrontmatterAndBody,
} from '../../../src/lib/frontmatter';
import type { IIssueScaffoldFrontmatter } from '../../../src/lib/contracts/issue.types';

const baseFrontmatter: IIssueScaffoldFrontmatter = {
	source: 'github',
	source_id: 123,
	source_url: 'https://github.com/o/r/issues/123',
	source_author: 'octocat',
	ingested_at: '2026-06-21T00:00:00.000Z',
	status: 'ingested',
	resolution: 'pending',
	proposals: [],
	comments: [],
};

describe('serializeFrontmatterBlock + parseFrontmatterBlock round-trip', async () => {
	it('round-trips a minimal frontmatter (no proposals, no comments, no dismiss reason)', async () => {
		const serialized = serializeFrontmatterBlock(baseFrontmatter);
		expect(serialized.startsWith('---\n')).toBe(true);
		expect(serialized).toContain('source: github');
		expect(serialized).toContain('proposals: []');
		expect(serialized).toContain('comments: []');

		const block = extractFrontmatterBlock(`${serialized}\nbody here\n`);
		expect(block).not.toBeNull();
		const parsed = parseFrontmatterBlock(block as string);
		expect(parsed).toEqual(baseFrontmatter);
	});

	it('round-trips proposals as a non-empty array', async () => {
		const fm: IIssueScaffoldFrontmatter = {
			...baseFrontmatter,
			status: 'analyzed',
			resolution: 'promoted-multiple',
			proposals: ['f00043', 'f00044'],
		};
		const serialized = serializeFrontmatterBlock(fm);
		const block = extractFrontmatterBlock(serialized);
		const parsed = parseFrontmatterBlock(block as string);
		expect(parsed.proposals).toEqual(['f00043', 'f00044']);
		expect(parsed.status).toBe('analyzed');
		expect(parsed.resolution).toBe('promoted-multiple');
	});

	it('round-trips comments with bodies containing colons and hashes', async () => {
		const fm: IIssueScaffoldFrontmatter = {
			...baseFrontmatter,
			comments: [
				{
					author: 'reviewer',
					body: 'Note: this needs a #123 fix, see: docs',
					createdAt: '2026-06-21T01:00:00.000Z',
					url: 'https://github.com/o/r/issues/123#comment-1',
				},
				{
					author: 'octocat',
					body: 'plain text body',
					createdAt: '2026-06-21T02:00:00.000Z',
					url: 'https://github.com/o/r/issues/123#comment-2',
				},
			],
		};
		const serialized = serializeFrontmatterBlock(fm);
		const block = extractFrontmatterBlock(serialized);
		const parsed = parseFrontmatterBlock(block as string);
		expect(parsed.comments).toEqual(fm.comments);
	});

	it('round-trips a dismiss_reason', async () => {
		const fm: IIssueScaffoldFrontmatter = {
			...baseFrontmatter,
			resolution: 'dismissed',
			dismiss_reason: 'duplicate of #45',
		};
		const serialized = serializeFrontmatterBlock(fm);
		const block = extractFrontmatterBlock(serialized);
		const parsed = parseFrontmatterBlock(block as string);
		expect(parsed.dismiss_reason).toBe('duplicate of #45');
	});

	it('quotes values that look like other YAML types so they parse back as strings', async () => {
		const fm: IIssueScaffoldFrontmatter = {
			...baseFrontmatter,
			source_author: 'true',
		};
		const serialized = serializeFrontmatterBlock(fm);
		const block = extractFrontmatterBlock(serialized);
		const parsed = parseFrontmatterBlock(block as string);
		expect(parsed.source_author).toBe('true');
	});
});

describe('extractFrontmatterBlock', async () => {
	it('returns null when there is no frontmatter fence', async () => {
		expect(extractFrontmatterBlock('# just a heading\n\nbody')).toBeNull();
	});
});

describe('splitFrontmatterAndBody', async () => {
	it('splits a full scaffold file into block and body', async () => {
		const serialized = serializeFrontmatterBlock(baseFrontmatter);
		const full = `${serialized}\n# Title\n\nBody text\n`;
		const { block, body } = splitFrontmatterAndBody(full);
		expect(block).not.toBeNull();
		expect(body).toBe('\n# Title\n\nBody text\n');
	});

	it('returns a null block and the original content when there is no fence', async () => {
		const { block, body } = splitFrontmatterAndBody('no frontmatter here');
		expect(block).toBeNull();
		expect(body).toBe('no frontmatter here');
	});
});

describe('parseFrontmatterBlock validation', async () => {
	it('throws when a required key is missing', async () => {
		expect(() => parseFrontmatterBlock('source: github\n')).toThrow(
			/missing required key/,
		);
	});

	it('throws on an invalid status value', async () => {
		const bad = serializeFrontmatterBlock(baseFrontmatter).replace(
			'status: ingested',
			'status: bogus',
		);
		const block = extractFrontmatterBlock(bad) as string;
		expect(() => parseFrontmatterBlock(block)).toThrow(/invalid status/);
	});

	it('throws on an invalid resolution value', async () => {
		const bad = serializeFrontmatterBlock(baseFrontmatter).replace(
			'resolution: pending',
			'resolution: bogus',
		);
		const block = extractFrontmatterBlock(bad) as string;
		expect(() => parseFrontmatterBlock(block)).toThrow(
			/invalid resolution/,
		);
	});
});
