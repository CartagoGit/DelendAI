import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runAnalyzeIssue,
	type IAnalyzeIssueToolOptions,
} from '../../../../src/lib/tools/analyze-issue.tool';
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
		author: 'octocat',
		url: `https://github.com/o/r/issues/${number}`,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body,
		comments: [],
	},
	comments: [],
	tier: 'gh',
});

const fakeClient = (
	body: string,
	labels: readonly string[] = [],
): IGithubClient => ({
	fetchIssue: async (number) => buildFetchResult(number, body, labels),
	listIssues: async () => ({ issues: [], tier: 'gh' }),
});

describe('issues_analyze', () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-analyze-'));
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

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
			fetchIssue: async () => {
				throw new Error('network down');
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const result = await runAnalyzeIssue(
			{ number: 14 },
			buildOptions(client),
		);
		expect(result.isError).toBe(true);
		const out = JSON.parse(result.content[0]?.text ?? '{}');
		expect(out.ok).toBe(false);
		expect(out.error.reason).toContain('network down');
	});
});
