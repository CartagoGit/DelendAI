/**
 * one-scaffold-per-issue.spec.ts — a forced re-ingest after a title change
 * rewrites the scaffold already there, and a multi-line comment survives
 * the frontmatter round-trip.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildFrontmatterLines,
	parseFrontmatterBlock,
} from '../../../src/lib/frontmatter';
import type {
	IGithubIssueDetail,
	IIssueScaffoldFrontmatter,
} from '../../../src/lib/contracts/issue.types';
import { writeNewScaffold } from '../../../src/lib/tools/ingest-issue.tool';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

describe('one scaffold per issue', () => {
	it('rewrites the existing file when the title changed', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'issues-one-'));
		dirs.push(dir);
		const detail = (title: string): IGithubIssueDetail => ({
			number: 7,
			title,
			body: 'body',
			author: 'a',
			url: 'https://example.test/7',
			state: 'open',
			labels: [],
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			commentsCount: 0,
			comments: [],
		});
		await writeNewScaffold(dir, detail('First title'));
		await writeNewScaffold(dir, detail('Renamed title'));
		expect(readdirSync(dir)).toHaveLength(1);
	});

	it('round-trips a multi-line comment body', () => {
		const body = 'line one\n  - author: not a field\nline three\r\nend';
		const frontmatter: IIssueScaffoldFrontmatter = {
			source: 'github',
			source_id: 7,
			source_url: 'https://example.test/7',
			source_author: 'a',
			ingested_at: '2026-01-01T00:00:00Z',
			status: 'ingested',
			resolution: 'pending',
			proposals: [],
			comments: [
				{
					author: 'bob',
					body,
					createdAt: '2026-01-02T00:00:00Z',
					url: 'https://example.test/c1',
				},
			],
		};
		const parsed = parseFrontmatterBlock(
			buildFrontmatterLines(frontmatter).join('\n'),
		);
		expect(parsed.comments).toEqual(frontmatter.comments);
	});
});
