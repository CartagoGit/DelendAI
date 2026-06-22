import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runResolveIssue,
	type IResolveIssueToolOptions,
} from '../../../../src/lib/tools/resolve-issue.tool';
import {
	buildScaffold,
	buildScaffoldFileName,
	serializeScaffold,
} from '../../../../src/lib/issue-scaffold';
import type { IGithubIssueDetail } from '../../../../src/lib/contracts';

/** Create a scaffold file for issue #n in the given dir. Returns the file name. */
const seedScaffold = async (
	dirAbs: string,
	number: number,
	title: string,
): Promise<string> => {
	const issueDetail: IGithubIssueDetail = {
		number,
		title,
		state: 'open',
		labels: ['bug'],
		author: 'octocat',
		url: `https://github.com/o/r/issues/${number}`,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body: 'body',
		comments: [],
	};
	const scaffold = buildScaffold(issueDetail, []);
	const fileName = buildScaffoldFileName(number, title);
	const filePath = join(dirAbs, fileName);
	await writeFile(filePath, serializeScaffold(scaffold), 'utf8');
	return fileName;
};

describe('issues_resolve', () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-resolve-'));
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

	const buildOptions = (): IResolveIssueToolOptions => ({
		namespacePrefix: 'issues',
		scaffoldDirAbs,
	});

	it('rejects resolution:"dismissed" without a dismissReason', async () => {
		const result = await runResolveIssue(
			{ number: 1, resolution: 'dismissed' },
			buildOptions(),
		);

		expect(result.isError).toBe(true);
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(false);
		expect(out.error.reason).toContain('dismissReason');
	});

	it('returns a toolError when no scaffold exists for the issue', async () => {
		const result = await runResolveIssue(
			{ number: 999, resolution: 'promoted', proposalIds: ['f00043'] },
			buildOptions(),
		);

		expect(result.isError).toBe(true);
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(false);
		expect(out.error.reason).toContain('no scaffold found');
	});

	it('mutates an existing scaffold to resolution:"promoted" with proposalIds', async () => {
		const fileName = await seedScaffold(scaffoldDirAbs, 2, 'Fix me');
		const filePath = join(scaffoldDirAbs, fileName);

		const result = await runResolveIssue(
			{
				number: 2,
				resolution: 'promoted',
				proposalIds: ['f00043', 'f00045'],
			},
			buildOptions(),
		);

		expect(result.isError).toBeUndefined();
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.filePath).toBe(filePath);
		expect(out.scaffold.frontmatter.resolution).toBe('promoted');
		expect(out.scaffold.frontmatter.proposals).toEqual([
			'f00043',
			'f00045',
		]);

		// Persisted to disk. The serializer emits non-empty
		// string arrays as block-YAML (`proposals:\n  - f00043\n  -
		// f00045`), not inline `[f00043, f00045]`, so assert on
		// the block form.
		const written = await readFile(filePath, 'utf8');
		expect(written).toContain('resolution: promoted');
		expect(written).toContain('proposals:');
		expect(written).toContain('  - f00043');
		expect(written).toContain('  - f00045');
	});

	it('mutates to resolution:"promoted-multiple" preserving all proposalIds', async () => {
		const fileName = await seedScaffold(scaffoldDirAbs, 3, 'Multi slice');
		const filePath = join(scaffoldDirAbs, fileName);

		const result = await runResolveIssue(
			{
				number: 3,
				resolution: 'promoted-multiple',
				proposalIds: ['f00001', 'f00002', 'f00003'],
			},
			buildOptions(),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.scaffold.frontmatter.resolution).toBe('promoted-multiple');
		expect(out.scaffold.frontmatter.proposals).toHaveLength(3);
		const written = await readFile(filePath, 'utf8');
		expect(written).toContain('resolution: promoted-multiple');
	});

	it('mutates to resolution:"dismissed" with a non-empty dismissReason', async () => {
		const fileName = await seedScaffold(
			scaffoldDirAbs,
			4,
			'Not actionable',
		);
		const filePath = join(scaffoldDirAbs, fileName);

		const result = await runResolveIssue(
			{
				number: 4,
				resolution: 'dismissed',
				dismissReason: 'Duplicate of f00001.',
			},
			buildOptions(),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.scaffold.frontmatter.resolution).toBe('dismissed');
		expect(out.scaffold.frontmatter.dismiss_reason).toBe(
			'Duplicate of f00001.',
		);

		const written = await readFile(filePath, 'utf8');
		expect(written).toContain('dismiss_reason: Duplicate of f00001.');
	});

	it('trims whitespace-only dismissReason as missing', async () => {
		await seedScaffold(scaffoldDirAbs, 5, 'Whitespace');
		const result = await runResolveIssue(
			{
				number: 5,
				resolution: 'dismissed',
				dismissReason: '   \n\t  ',
			},
			buildOptions(),
		);

		expect(result.isError).toBe(true);
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(false);
		expect(out.error.reason).toContain('dismissReason');
	});

	it('omits dismiss_reason when resolution is not "dismissed"', async () => {
		const fileName = await seedScaffold(scaffoldDirAbs, 6, 'Clean promote');
		await runResolveIssue(
			{ number: 6, resolution: 'promoted', proposalIds: ['f00043'] },
			buildOptions(),
		);

		const written = await readFile(join(scaffoldDirAbs, fileName), 'utf8');
		expect(written).not.toContain('dismiss_reason:');
	});
});
