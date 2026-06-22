import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAnalyzeIssue,
	type IAnalyzeIssueToolOptions,
} from '../../../../src/lib/tools/analyze-issue.tool';
<<<<<<< HEAD
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
=======
import type { IFetchIssueResult } from '../../../../src/lib/github-client';
import type { IGithubClient } from '../../../../src/lib/tools/list-issues.tool';

const buildFetchResult = (
	number: number,
	body: string,
	labels: readonly string[] = [],
): IFetchIssueResult => ({
	data: {
		number,
		title: 'Sample issue',
		state: 'open',
		labels: [...labels],
>>>>>>> origin/agent/copilot-minimax-m3
		author: 'octocat',
		url: `https://github.com/o/r/issues/${number}`,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
<<<<<<< HEAD
		body: 'It crashes every time.',
		comments: [],
		...overrides,
=======
		body,
		comments: [],
>>>>>>> origin/agent/copilot-minimax-m3
	},
	comments: [],
	tier: 'gh',
});

<<<<<<< HEAD
=======
const fakeClient = (
	body: string,
	labels: readonly string[] = [],
): IGithubClient => ({
	fetchIssue: async (number) => buildFetchResult(number, body, labels),
	listIssues: async () => ({ issues: [], tier: 'gh' }),
});

>>>>>>> origin/agent/copilot-minimax-m3
describe('issues_analyze', () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-analyze-'));
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

<<<<<<< HEAD
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
		// The scaffold body includes the source/author/state header lines
		// on top of the issue body, so the actual length lands in the
		// 80-300 bucket (ceiling 0.55) — and a label-only signal then
		// scales that to 0.55 × 0.85 = 0.47. What we really want to
		// assert is that a body this short never earns the >= 0.75
		// "high confidence" bucket that a detailed body could.
		expect(body.draft.confidence).toBeLessThan(0.75);
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
=======
	const buildOptions = (
		githubClient: IGithubClient,
	): IAnalyzeIssueToolOptions => ({
		namespacePrefix: 'issues',
		githubClient,
		scaffoldDirAbs,
	});

	it('classifies a bug-labeled issue with repro steps as kind:"fix"', async () => {
		const body =
			'## Repro steps\n\n1. run the tool\n2. observe crash\n\nIt crashes every time. The stack trace mentions plugins/issues and apps/web/src and packages/core.';
		const result = await runAnalyzeIssue(
			{ number: 7 },
			buildOptions(fakeClient(body, ['bug', 'p1'])),
		);

		expect(result.isError).toBeUndefined();
		const bodyOut = JSON.parse(result.content[0]?.text ?? '{}');
		expect(bodyOut.ok).toBe(true);
		expect(bodyOut.draft.kind).toBe('fix');
		expect(bodyOut.draft.rationale).toContain('repro steps');
		expect(bodyOut.sourceFile).toContain('github#7');
	});

	it('classifies a "would be nice if" body as kind:"feat"', async () => {
		const body =
			'It would be nice if the audit tool could output JSON for CI consumption. The current format is hard to parse downstream.';
		const result = await runAnalyzeIssue(
			{ number: 8 },
			buildOptions(fakeClient(body, [])),
		);

		expect(result.isError).toBeUndefined();
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.draft.kind).toBe('feat');
		expect(out.draft.rationale).toContain('feature request');
	});

	it('classifies via labels when body has no strong signal', async () => {
		const body = 'Short.';
		const result = await runAnalyzeIssue(
			{ number: 9 },
			buildOptions(fakeClient(body, ['refactor'])),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.draft.kind).toBe('refactor');
	});

	it('returns kind:"dismiss" with low confidence when no signal is present', async () => {
		const body = 'one liner';
		const result = await runAnalyzeIssue(
			{ number: 10 },
			buildOptions(fakeClient(body, [])),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.draft.kind).toBe('dismiss');
		expect(out.draft.confidence).toBeLessThanOrEqual(0.3);
	});

	it('suggests slices when the body mentions 3+ distinct path roots', async () => {
		const body =
			'Touches plugins/issues, apps/web/src, and packages/core/lib. Also mentions examples/minimal and extensions/vscode.';
		const result = await runAnalyzeIssue(
			{ number: 11 },
			buildOptions(fakeClient(body, ['enhancement'])),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		expect(out.draft.suggestedSlices).toBeDefined();
		expect(out.draft.suggestedSlices?.length).toBeGreaterThanOrEqual(3);
	});

	it('rounds confidence to 2 decimals', async () => {
		const body = 'a'.repeat(150);
		const result = await runAnalyzeIssue(
			{ number: 12 },
			buildOptions(fakeClient(body, ['chore'])),
		);

		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
		// confidence is rounded to 2 decimals; ensure the value is a number
		// with at most 2 decimal places.
		expect(out.draft.confidence).toBeTypeOf('number');
		const decimals = (out.draft.confidence.toString().split('.')[1] ?? '')
			.length;
		expect(decimals).toBeLessThanOrEqual(2);
	});

	it('auto-ingests a missing scaffold (idempotent ingest path)', async () => {
		let fetchCount = 0;
		const client: IGithubClient = {
			fetchIssue: async (number) => {
				fetchCount += 1;
				return buildFetchResult(
					number,
					'## Repro steps\n\n1. run\n2. fail',
					['bug'],
				);
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		// First call ingests.
		await runAnalyzeIssue({ number: 13 }, buildOptions(client));
		// Second call must NOT re-fetch (idempotency is the contract of
		// `loadOrIngestScaffold`).
		const result2 = await runAnalyzeIssue(
			{ number: 13 },
			buildOptions(client),
		);
		expect(result2.isError).toBeUndefined();
		expect(fetchCount).toBe(1);
		const out = JSON.parse(result2.content[0]?.text ?? '{}');
		expect(out.ok).toBe(true);
	});

	it('returns a toolError envelope when the client throws', async () => {
		const client: IGithubClient = {
>>>>>>> origin/agent/copilot-minimax-m3
			fetchIssue: async () => {
				throw new Error('network down');
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
<<<<<<< HEAD
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
=======
		const result = await runAnalyzeIssue(
			{ number: 14 },
			buildOptions(client),
		);
		expect(result.isError).toBe(true);
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(false);
		expect(out.error.reason).toContain('network down');
>>>>>>> origin/agent/copilot-minimax-m3
	});
});
