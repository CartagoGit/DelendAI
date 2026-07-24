import { describe, expect, it } from 'vitest';

import {
	buildChangelog,
	gitChangelog,
	inferBump,
	parseConventionalCommits,
} from '../../../src/lib/services/changelog';
import type { IGitRunner } from '../../../src/lib/services/git';

const commits = [
	{ hash: 'a1', subject: 'feat(cli): add agents command' },
	{ hash: 'b2', subject: 'fix: handle empty roster' },
	{ hash: 'c3', subject: 'chore: bump deps' },
	{ hash: 'd4', subject: 'docs: update readme' },
	{ hash: 'e5', subject: 'not a conventional commit' },
];

describe('parseConventionalCommits', () => {
	it('parses type/scope/breaking/subject and ignores non-conventional lines', () => {
		const parsed = parseConventionalCommits(commits);
		expect(parsed).toHaveLength(4);
		expect(parsed[0]).toMatchObject({
			type: 'feat',
			scope: 'cli',
			breaking: false,
			subject: 'add agents command',
		});
	});

	it('detects a breaking change via ! and via BREAKING CHANGE', () => {
		const parsed = parseConventionalCommits([
			{ hash: 'x', subject: 'feat!: drop node 18' },
			{ hash: 'y', subject: 'refactor: rework\n\nBREAKING CHANGE: api' },
		]);
		expect(parsed.every((c) => c.breaking)).toBe(true);
	});
});

describe('inferBump', () => {
	it('breaking → major, feat → minor, fix/chore → patch, empty → none', () => {
		expect(inferBump(parseConventionalCommits(commits))).toBe('minor');
		expect(
			inferBump(
				parseConventionalCommits([{ hash: 'z', subject: 'fix: x' }]),
			),
		).toBe('patch');
		expect(
			inferBump(
				parseConventionalCommits([{ hash: 'z', subject: 'feat!: x' }]),
			),
		).toBe('major');
		expect(inferBump([])).toBe('none');
	});
});

describe('buildChangelog', () => {
	it('groups by type in canonical order (feat before fix before chore)', () => {
		const changelog = buildChangelog(parseConventionalCommits(commits));
		expect(changelog.groups.map((g) => g.type)).toEqual([
			'feat',
			'fix',
			'docs',
			'chore',
		]);
		expect(changelog.bump).toBe('minor');
		expect(changelog.total).toBe(4);
	});
});

describe('gitChangelog', () => {
	it('runs git log and builds the changelog', async () => {
		const run: IGitRunner = async () => ({
			ok: true,
			output: 'a1\x1ffeat: one\nb2\x1ffix: two',
		});
		const changelog = await gitChangelog(run, { limit: 50 });
		expect(changelog.total).toBe(2);
		expect(changelog.bump).toBe('minor');
	});

	it('returns an empty changelog when git fails', async () => {
		const run: IGitRunner = async () => ({ ok: false, output: '' });
		expect(await gitChangelog(run)).toEqual({
			groups: [],
			bump: 'none',
			total: 0,
		});
	});
});
