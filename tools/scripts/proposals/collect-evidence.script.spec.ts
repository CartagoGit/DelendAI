import { describe, expect, it } from 'vitest';

import {
	parseGitHubRunsJson,
	serializeProposalEvidence,
} from './collect-evidence.script.ts';

describe('collect-evidence', () => {
	it('parses gh run list output into proposal CI evidence rows', () => {
		const runs = parseGitHubRunsJson(
			JSON.stringify([
				{
					workflowName: 'CI',
					conclusion: 'success',
					databaseId: 101,
					url: 'https://example.test/runs/101',
				},
				{
					name: 'pages',
					status: 'in_progress',
					databaseId: '202',
				},
			]),
		);

		expect(runs).toEqual([
			{
				name: 'CI',
				status: 'success',
				runId: '101',
				logUrl: 'https://example.test/runs/101',
			},
			{
				name: 'pages',
				status: 'skipped',
				runId: '202',
			},
		]);
	});

	it('serializes evidence as a nested frontmatter block', () => {
		const lines = serializeProposalEvidence({
			proposalId: 'c00011',
			commit: 'abc123',
			collectedAt: '2026-08-25T12:00:00.000Z',
			ciRuns: [
				{
					name: 'CI',
					status: 'success',
					runId: '101',
					logUrl: 'https://example.test/runs/101',
				},
			],
		});

		expect(lines).toEqual([
			'commit: "abc123"',
			'collected-at: "2026-08-25T12:00:00.000Z"',
			'ci-runs:',
			'  - name: "CI"',
			'    status: "success"',
			'    runId: "101"',
			'    logUrl: "https://example.test/runs/101"',
		]);
	});
});
