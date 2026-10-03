import { describe, expect, it } from 'vitest';

import { runListCodeScanning } from '../../../../src/lib/tools/list-code-scanning.tool';
import type {
	IFetchIssueResult,
	IGithubClient,
	IListCodeScanningAlertsOptions,
	IListCodeScanningAlertsResult,
	IListCodeScanningToolOptions,
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
	listCodeScanningAlertsImpl: (
		opts?: IListCodeScanningAlertsOptions,
	) => Promise<IListCodeScanningAlertsResult>,
): IGithubClient => ({
	fetchIssue: async () => STUB_FETCH_RESULT,
	listIssues: async () => ({ issues: [], tier: 'gh' }),
	listDependabotAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listCodeScanningAlerts: listCodeScanningAlertsImpl,
	listSecretScanningAlerts: async () => ({ alerts: [], tier: 'gh' }),
	listSecurityAdvisories: async () => ({ advisories: [], tier: 'gh' }),
});

describe('issues_list_code_scanning', async () => {
	it('delegates to the injected client and returns alerts + tier', async () => {
		let receivedOpts: IListCodeScanningAlertsOptions | undefined;
		const options: IListCodeScanningToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return {
					alerts: [
						{
							number: 42,
							state: 'open',
							severity: 'error',
							rule: {
								id: 'js/sql-injection',
								severity: 'error',
								description: 'Unsanitized SQL input',
								name: 'SQL injection',
							},
							tool: { name: 'CodeQL', version: '2.18.0' },
							mostRecentInstance: {
								path: 'src/server.ts',
								startLine: 87,
							},
							htmlUrl: 'https://github.com/o/r/code-scanning/42',
							createdAt: '2026-02-01T00:00:00Z',
							updatedAt: '2026-02-02T00:00:00Z',
						},
					],
					tier: 'rest-authed',
				};
			}),
		};

		const result = await runListCodeScanning(
			{ state: 'open', severity: 'error', limit: 10 },
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
				severity: 'error',
				rule: {
					id: 'js/sql-injection',
					severity: 'error',
					description: 'Unsanitized SQL input',
					name: 'SQL injection',
				},
				tool: { name: 'CodeQL', version: '2.18.0' },
				mostRecentInstance: {
					path: 'src/server.ts',
					startLine: 87,
				},
				htmlUrl: 'https://github.com/o/r/code-scanning/42',
				createdAt: '2026-02-01T00:00:00Z',
				updatedAt: '2026-02-02T00:00:00Z',
			},
		]);
		expect(receivedOpts).toEqual({
			state: 'open',
			severity: 'error',
			limit: 10,
		});
	});

	it('returns a tool error when the client throws', async () => {
		const options: IListCodeScanningToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async () => {
				throw new Error('network down');
			}),
		};

		const result = await runListCodeScanning({}, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('network down');
		expect(body.error.nextAction).toContain('Check repo configuration');
	});
});
