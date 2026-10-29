import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/contracts';
import type { IForgeExec } from '@delendai/forge/public';

import { listOpenPrs, viewPr } from '../../../src/lib/services/forge';

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

const run = (
	stdout: string,
	stderr = '',
	code = 0,
	unavailable = false,
): IExternalToolRun => ({
	ok: code === 0,
	code,
	stdout,
	stderr,
	timedOut: false,
	unavailable,
});

/** Answers the forge plugin's origin lookup, then the gh call itself. */
const execWith =
	(stdout: string, stderr = '', code = 0, unavailable = false): IForgeExec =>
	async (input: IRunExternalToolInput) =>
		input.tool.bin === 'git'
			? run('git@github.com:o/r.git\n')
			: run(stdout, stderr, code, unavailable);

describe('listOpenPrs', () => {
	it('maps the forge plugin PR list onto the git tool shape', async () => {
		const result = await listOpenPrs('/repo', execWith(PR_LIST));
		expect(result.available).toBe(true);
		expect(result.prs).toHaveLength(2);
		expect(result.prs[0]).toEqual({
			number: 11,
			title: 'deps: bump the development group',
			branch: 'dependabot/npm_and_yarn/x',
			url: 'https://github.com/o/r/pull/11',
			draft: false,
		});
		expect(result.prs[1]?.draft).toBe(true);
	});

	it('reports unavailable when gh is missing', async () => {
		const result = await listOpenPrs('/repo', execWith('', '', 127, true));
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
		expect(result.pr?.state).toBe('OPEN');
		expect(result.pr?.checks).toHaveLength(2);
		expect(result.pr?.checks[0]).toMatchObject({
			name: 'lint (biome)',
			conclusion: 'FAILURE',
			url: 'https://ci/1',
		});
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
		const result = await viewPr(
			'/repo',
			undefined,
			execWith('', '', 127, true),
		);
		expect(result.available).toBe(false);
	});
});
