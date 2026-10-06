/**
 * The ports bind every GitHub call to the configured repository. A port
 * that forwarded the wrong repository, or passed `undefined` where the
 * client expects an options object, would read or write another
 * project's issues without any other spec noticing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ fn: string; args: unknown[] }> = [];
const recorder =
	(fn: string) =>
	async (...args: unknown[]) => {
		calls.push({ fn, args });
		return { ok: true };
	};

vi.mock('../../../../src/lib/github-client', () => ({
	createIssueViaGh: recorder('createIssueViaGh'),
	fetchIssue: recorder('fetchIssue'),
	listIssues: recorder('listIssues'),
	listDependabotAlerts: recorder('listDependabotAlerts'),
	listCodeScanningAlerts: recorder('listCodeScanningAlerts'),
	listSecretScanningAlerts: recorder('listSecretScanningAlerts'),
	listSecurityAdvisories: recorder('listSecurityAdvisories'),
}));

const { createGithubClient, createIssueWriter } = await import(
	'../../../../src/lib/services/github-client-port.service'
);

const REPO = 'owner/project';

beforeEach(() => {
	calls.length = 0;
});

describe('createGithubClient', () => {
	it('binds every read to the configured repository', async () => {
		const client = createGithubClient(REPO);
		await client.fetchIssue(7);
		await client.listIssues({ state: 'open' });
		await client.listDependabotAlerts({});
		await client.listCodeScanningAlerts({});
		await client.listSecretScanningAlerts({});
		await client.listSecurityAdvisories({});
		expect(calls.map((call) => call.fn)).toEqual([
			'fetchIssue',
			'listIssues',
			'listDependabotAlerts',
			'listCodeScanningAlerts',
			'listSecretScanningAlerts',
			'listSecurityAdvisories',
		]);
		expect(calls.every((call) => call.args[0] === REPO)).toBe(true);
		expect(calls[0]?.args[1]).toBe(7);
		expect(calls[1]?.args[1]).toEqual({ state: 'open' });
	});

	it('passes an empty options object when the caller gives none', async () => {
		const client = createGithubClient(REPO);
		await client.listIssues();
		await client.listDependabotAlerts();
		await client.listCodeScanningAlerts();
		await client.listSecretScanningAlerts();
		await client.listSecurityAdvisories();
		expect(calls.map((call) => call.args[1])).toEqual([{}, {}, {}, {}, {}]);
	});
});

describe('createIssueWriter', () => {
	it('creates issues in the configured repository', async () => {
		const input = { title: 'boom', body: 'stack', labels: ['bug'] };
		await createIssueWriter(REPO).createIssue(input);
		expect(calls).toEqual([
			{ fn: 'createIssueViaGh', args: [REPO, input] },
		]);
	});
});
