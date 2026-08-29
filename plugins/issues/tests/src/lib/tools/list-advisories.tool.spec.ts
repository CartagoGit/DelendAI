import { describe, expect, it } from 'vitest';

import { runListAdvisories } from '../../../../src/lib/tools/list-advisories.tool';
import type {
	IFetchIssueResult,
	IGithubClient,
	IListAdvisoriesToolOptions,
	IListSecurityAdvisoriesOptions,
	IListSecurityAdvisoriesResult,
} from '../../../../src/lib/contracts';

const STUB_FETCH_RESULT: IFetchIssueResult = {
	data: {
		number: 1,
		title: 'stub',
		state: 'open',
		labels: [],
		author: 'octocat',
		url: 'https://github.com/o/r/issues/1',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body: 'stub body',
		comments: [],
	},
	comments: [],
	tier: 'gh',
};

const fakeClient = (
	listSecurityAdvisoriesImpl: (
		opts?: IListSecurityAdvisoriesOptions,
	) => Promise<IListSecurityAdvisoriesResult>,
): IGithubClient => ({
	fetchIssue: async () => STUB_FETCH_RESULT,
	listIssues: async () => ({ issues: [], tier: 'gh' }),
	listDependabotAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listCodeScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecretScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecurityAdvisories: listSecurityAdvisoriesImpl,
});

describe('issues_list_advisories', async () => {
	it('delegates to the injected client and returns advisories + tier', async () => {
		let receivedOpts: IListSecurityAdvisoriesOptions | undefined;
		const options: IListAdvisoriesToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return {
					advisories: [
						{
							ghsaId: 'GHSA-1234-5678-9abc',
							cveId: 'CVE-2026-1234',
							summary: 'Repository advisory summary',
							severity: 'high',
							state: 'published',
							htmlUrl:
								'https://github.com/o/r/security/advisories/GHSA-1234-5678-9abc',
							publishedAt: '2026-04-01T00:00:00Z',
							updatedAt: '2026-04-02T00:00:00Z',
						},
					],
					tier: 'rest-authed',
				};
			}),
		};

		const result = await runListAdvisories(
			{ state: 'published', limit: 10 },
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.tier).toBe('rest-authed');
		expect(body.advisories).toEqual([
			{
				ghsaId: 'GHSA-1234-5678-9abc',
				cveId: 'CVE-2026-1234',
				summary: 'Repository advisory summary',
				severity: 'high',
				state: 'published',
				htmlUrl:
					'https://github.com/o/r/security/advisories/GHSA-1234-5678-9abc',
				publishedAt: '2026-04-01T00:00:00Z',
				updatedAt: '2026-04-02T00:00:00Z',
			},
		]);
		expect(receivedOpts).toEqual({
			state: 'published',
			limit: 10,
		});
	});

	it('returns a tool error when the client throws', async () => {
		const options: IListAdvisoriesToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async () => {
				throw new Error('network down');
			}),
		};

		const result = await runListAdvisories({}, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('network down');
		expect(body.error.nextAction).toContain('Check repo configuration');
	});
});
