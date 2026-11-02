import { describe, expect, it } from 'vitest';

import { runListSecretScanning } from '../../../../src/lib/tools/list-secret-scanning.tool';
import type {
	IFetchIssueResult,
	IGithubClient,
	IListSecretScanningAlertsOptions,
	IListSecretScanningAlertsResult,
	IListSecretScanningToolOptions,
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
	listSecretScanningAlertsImpl: (
		opts?: IListSecretScanningAlertsOptions,
	) => Promise<IListSecretScanningAlertsResult>,
): IGithubClient => ({
	fetchIssue: async () => STUB_FETCH_RESULT,
	listIssues: async () => ({ issues: [], tier: 'gh' }),
	listDependabotAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listCodeScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecretScanningAlerts: listSecretScanningAlertsImpl,
	listSecurityAdvisories: async () => ({ advisories: [], tier: 'gh' }),
});

describe('issues_list_secret_scanning', async () => {
	it('delegates to the injected client and returns alerts + tier', async () => {
		let receivedOpts: IListSecretScanningAlertsOptions | undefined;
		const options: IListSecretScanningToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return {
					alerts: [
						{
							number: 42,
							state: 'resolved',
							secretType: 'github_personal_access_token',
							pushProtection: true,
							validity: 'active',
							locationsCount: 4,
							htmlUrl:
								'https://github.com/o/r/secret-scanning/42',
							createdAt: '2026-03-01T00:00:00Z',
							updatedAt: '2026-03-02T00:00:00Z',
						},
					],
					tier: 'rest-authed',
				};
			}),
		};

		const result = await runListSecretScanning(
			{ state: 'resolved', limit: 10 },
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.tier).toBe('rest-authed');
		expect(body.alerts).toEqual([
			{
				number: 42,
				state: 'resolved',
				secretType: 'github_personal_access_token',
				pushProtection: true,
				validity: 'active',
				locationsCount: 4,
				htmlUrl: 'https://github.com/o/r/secret-scanning/42',
				createdAt: '2026-03-01T00:00:00Z',
				updatedAt: '2026-03-02T00:00:00Z',
			},
		]);
		expect(receivedOpts).toEqual({
			state: 'resolved',
			limit: 10,
		});
	});

	it('returns a tool error when the client throws', async () => {
		const options: IListSecretScanningToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async () => {
				throw new Error('network down');
			}),
		};

		const result = await runListSecretScanning({}, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('network down');
		expect(body.error.nextAction).toContain('Check repo configuration');
	});
});
