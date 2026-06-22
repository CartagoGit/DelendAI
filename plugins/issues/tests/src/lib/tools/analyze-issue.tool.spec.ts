import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAnalyzeIssue,
	type IAnalyzeIssueToolOptions,
} from '../../../../src/lib/tools/analyze-issue.tool';
import type { IGithubClient } from '../../../../src/lib/tools/list-issues.tool';
import type { IFetchIssueResult } from '../../../../src/lib/github-client';

const buildFetchResult = (
	number: number,
	overrides: Partial<IFetchIssueResult['data']> = {},
): IFetchIssueResult => ({
	data: {
		number,
		title: 'Crash on startup',
		state: 'open',
		labels: ['bug'],
		author: 'octocat',
		url: `https://github.com/o/r/issues/${number}`,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body: 'It crashes every time.',
		comments: [],
		...overrides,
	},
	comments: [],
	tier: 'gh',
});

describe('issues_analyze', () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-analyze-'));
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

	it('classifies a body with explicit repro steps as kind:"fix"', async () => {
		const longBody = [
			'> Labels: bug',
			'',
			'# Crash on startup',
			'',
			'Steps to reproduce:',
			'1. Open the app.',
			'2. Click submit.',
			'3. Observe the crash.',
		].join('\n');
		const githubClient: IGithubClient = {
			fetchIssue: async (number) =>
				buildFetchResult(number, { body: longBody, labels: [] }),
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 1 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.draft.kind).toBe('fix');
		expect(body.draft.rationale).toMatch(/repro steps/i);
	});

	it('classifies a feature-request body as kind:"feat"', async () => {
		const longBody = [
			'> Labels: (none)',
			'',
			'# A new dashboard',
			'',
			'It would be nice if the dashboard showed the recent merges in a',
			'compact list at the top. Right now you have to dig into the',
			'merge log to see what landed this week, and that hurts the',
			'weekly review workflow a lot.',
		].join('\n');
		const githubClient: IGithubClient = {
			fetchIssue: async (number) =>
				buildFetchResult(number, { body: longBody, labels: [] }),
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 2 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.draft.kind).toBe('feat');
		expect(body.draft.rationale).toMatch(/feature request/i);
	});

	it('falls back to label kind when no body signal is present', async () => {
		const longBody = [
			'> Labels: refactor',
			'',
			'# Internal cleanup',
			'',
			'The proposal state machine has three branches that always run',
			'together but live in different files. Tidy them up so the next',
			'reader can follow the order without flipping between tabs.',
		].join('\n');
		const githubClient: IGithubClient = {
			fetchIssue: async (number) =>
				buildFetchResult(number, {
					body: longBody,
					labels: ['refactor'],
				}),
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 3 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.draft.kind).toBe('refactor');
		expect(body.draft.rationale).toMatch(/labels suggest "refactor"/);
	});

	it('caps confidence on a one-line body even when labels suggest a kind', async () => {
		const shortBody = '> Labels: bug\n\n# tiny\n\nshort';
		const githubClient: IGithubClient = {
			fetchIssue: async (number) =>
				buildFetchResult(number, { body: shortBody, labels: ['bug'] }),
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 4 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		// Short body → ceiling is 0.3, so even bug repro is < 0.4.
		expect(body.draft.confidence).toBeLessThan(0.4);
	});

	it('suggests splitting when 3+ distinct path segments are mentioned', async () => {
		const longBody = [
			'> Labels: (none)',
			'',
			'# Spans many areas',
			'',
			'Touches plugins/issues, apps/web, extensions/vscode and the',
			'root docs/CONTRIBUTING.md. A single proposal would not fit',
			'and we should split the work into several slices that',
			'each own one area end to end.',
		].join('\n');
		const githubClient: IGithubClient = {
			fetchIssue: async (number) =>
				buildFetchResult(number, { body: longBody, labels: [] }),
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 5 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.draft.suggestedSlices).toBeDefined();
		expect(body.draft.suggestedSlices?.length).toBeGreaterThanOrEqual(3);
	});

	it('returns an error envelope when the client throws', async () => {
		const githubClient: IGithubClient = {
			fetchIssue: async () => {
				throw new Error('network down');
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IAnalyzeIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runAnalyzeIssue({ number: 999 }, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toMatch(/network down/);
	});
});
