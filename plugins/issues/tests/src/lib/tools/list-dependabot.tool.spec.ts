import { describe, expect, it } from 'vitest';

import { runListDependabot } from '../../../../src/lib/tools/list-dependabot.tool';
import type {
	IFetchIssueResult,
	IGithubClient,
	IListDependabotAlertsOptions,
	IListDependabotAlertsResult,
	IListDependabotToolOptions,
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
	listDependabotAlertsImpl: (
		opts?: IListDependabotAlertsOptions,
	) => Promise<IListDependabotAlertsResult>,
): IGithubClient => ({
	fetchIssue: async () => STUB_FETCH_RESULT,
	listIssues: async () => ({ issues: [], tier: 'gh' }),
	listDependabotAlerts: listDependabotAlertsImpl,
	listCodeScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecretScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecurityAdvisories: async () => ({ advisories: [], tier: 'gh' }),
});

describe('issues_list_dependabot', async () => {
	it('delegates to the injected client and returns alerts + tier', async () => {
		let receivedOpts: IListDependabotAlertsOptions | undefined;
		const options: IListDependabotToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return {
					alerts: [
						{
							number: 42,
							state: 'open',
							severity: 'critical',
							package: { ecosystem: 'npm', name: 'left-pad' },
							vuln: {
								id: 'GHSA-dead-beef',
								severity: 'critical',
								summary: 'Prototype pollution',
							},
							htmlUrl: 'https://github.com/o/r/dependabot/42',
							createdAt: '2026-01-01T00:00:00Z',
							updatedAt: '2026-01-02T00:00:00Z',
						},
					],
					tier: 'rest-authed',
				};
			}),
		};

		const result = await runListDependabot(
			{ state: 'open', severity: 'critical', limit: 10 },
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.tier).toBe('rest-authed');
		expect(body.alerts).toEqual([
			{
				number: 42,
				state: 'open',
				severity: 'critical',
				package: { ecosystem: 'npm', name: 'left-pad' },
				vuln: {
					id: 'GHSA-dead-beef',
					severity: 'critical',
					summary: 'Prototype pollution',
				},
				htmlUrl: 'https://github.com/o/r/dependabot/42',
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-02T00:00:00Z',
			},
		]);
		expect(receivedOpts).toEqual({
			state: 'open',
			severity: 'critical',
			limit: 10,
		});
	});

	it('returns a tool error when the client throws', async () => {
		const options: IListDependabotToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async () => {
				throw new Error('network down');
			}),
		};

		const result = await runListDependabot({}, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('network down');
		expect(body.error.nextAction).toContain('Check repo configuration');
	});
});
