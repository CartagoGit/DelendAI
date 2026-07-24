import { describe, expect, it } from 'vitest';

import type { IArgvExec } from '@mcp-vertex/core/public';

import {
	listOpenPrs,
	parsePrList,
	parsePrView,
	viewPr,
} from '../../../src/lib/services/forge';

// Shapes captured from real `gh --json` runs against this repo.
const PR_LIST = JSON.stringify([
	{
		headRefName: 'dependabot/npm_and_yarn/x',
		isDraft: false,
		number: 11,
		title: 'deps: bump the development group',
		url: 'https://github.com/o/r/pull/11',
	},
	{
		headRefName: 'feat/y',
		isDraft: true,
		number: 12,
		title: 'wip',
		url: 'https://github.com/o/r/pull/12',
	},
]);

const PR_VIEW = JSON.stringify({
	mergeable: 'MERGEABLE',
	number: 11,
	reviewDecision: '',
	state: 'OPEN',
	title: 'deps: bump the development group',
	url: 'https://github.com/o/r/pull/11',
	statusCheckRollup: [
		{
			__typename: 'CheckRun',
			name: 'lint (biome)',
			status: 'COMPLETED',
			conclusion: 'FAILURE',
			detailsUrl: 'https://ci/1',
		},
		{
			__typename: 'CheckRun',
			name: 'Analyze (typescript)',
			status: 'COMPLETED',
			conclusion: 'SUCCESS',
			detailsUrl: 'https://ci/2',
		},
	],
});

const execWith = (stdout: string, stderr = '', code = 0): IArgvExec =>
	(async () => ({ code, stdout, stderr, timedOut: false })) as IArgvExec;

describe('parsePrList', () => {
	it('maps gh pr list json to structured PRs', () => {
		const prs = parsePrList(PR_LIST);
		expect(prs).toHaveLength(2);
		expect(prs[0]).toMatchObject({
			number: 11,
			branch: 'dependabot/npm_and_yarn/x',
			draft: false,
		});
		expect(prs[1]?.draft).toBe(true);
	});

	it('returns [] on malformed input (never throws)', () => {
		expect(parsePrList('')).toEqual([]);
		expect(parsePrList('not json')).toEqual([]);
	});
});

describe('parsePrView', () => {
	it('extracts detail + the CI check rollup', () => {
		const pr = parsePrView(PR_VIEW);
		expect(pr?.number).toBe(11);
		expect(pr?.state).toBe('OPEN');
		expect(pr?.checks).toHaveLength(2);
		expect(pr?.checks[0]).toMatchObject({
			name: 'lint (biome)',
			conclusion: 'FAILURE',
			url: 'https://ci/1',
		});
	});

	it('returns undefined on malformed input', () => {
		expect(parsePrView('not json')).toBeUndefined();
	});
});

describe('listOpenPrs', () => {
	it('returns parsed PRs when gh succeeds', async () => {
		const result = await listOpenPrs('/repo', execWith(PR_LIST));
		expect(result.available).toBe(true);
		expect(result.prs).toHaveLength(2);
	});

	it('reports unavailable + install hint when gh is missing (127)', async () => {
		const result = await listOpenPrs('/repo', execWith('', '', 127));
		expect(result.available).toBe(false);
		expect(result.note).toContain('gh');
		expect(result.prs).toEqual([]);
	});

	it('surfaces a gh error (e.g. unauth) as a note, not a throw', async () => {
		const result = await listOpenPrs(
			'/repo',
			execWith('', 'gh: not authenticated', 1),
		);
		expect(result.available).toBe(true);
		expect(result.note).toContain('not authenticated');
		expect(result.prs).toEqual([]);
	});
});

describe('viewPr', () => {
	it('returns detail with checks when gh succeeds', async () => {
		const result = await viewPr('/repo', '11', execWith(PR_VIEW));
		expect(result.available).toBe(true);
		expect(result.pr?.checks).toHaveLength(2);
	});

	it('notes when no PR matched (gh non-zero, no json)', async () => {
		const result = await viewPr(
			'/repo',
			'nope',
			execWith('', 'no pull requests found', 1),
		);
		expect(result.available).toBe(true);
		expect(result.pr).toBeUndefined();
		expect(result.note).toContain('no pull requests found');
	});

	it('reports unavailable when gh is missing', async () => {
		const result = await viewPr('/repo', undefined, execWith('', '', 127));
		expect(result.available).toBe(false);
	});
});
