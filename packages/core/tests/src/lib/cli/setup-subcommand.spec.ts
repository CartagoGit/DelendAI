/**
 * Specs for the `setup-github` CLI subcommand's pure core (f00030 S2):
 * detection helpers + the report builder driven by injected probes.
 */
import { describe, expect, it } from 'vitest';

import {
	buildSetupGithubReport,
	isIssuesConfigured,
	parseGithubRepo,
	resolveTier,
	type ISetupGithubCliDeps,
} from '../../../../src/lib/cli/setup-subcommand';

describe('setup-github detection helpers', async () => {
	it('parseGithubRepo handles https + ssh + non-github', async () => {
		expect(parseGithubRepo('https://github.com/o/n.git')).toBe('o/n');
		expect(parseGithubRepo('git@github.com:o/n.git')).toBe('o/n');
		expect(parseGithubRepo('https://gitlab.com/o/n')).toBeNull();
		expect(parseGithubRepo(null)).toBeNull();
	});

	it('resolveTier prefers gh > rest-authed > rest-anon', async () => {
		expect(resolveTier(true, undefined)).toBe('gh');
		expect(resolveTier(false, 'x')).toBe('rest-authed');
		expect(resolveTier(false, undefined)).toBe('rest-anon');
	});

	it('isIssuesConfigured reads plugins.issues', async () => {
		expect(isIssuesConfigured('{"plugins":{"issues":{}}}')).toBe(true);
		expect(isIssuesConfigured('{"plugins":{}}')).toBe(false);
		expect(isIssuesConfigured(undefined)).toBe(false);
	});
});

const deps = (
	over: Partial<ISetupGithubCliDeps> = {},
): ISetupGithubCliDeps => ({
	originUrl: () => 'https://github.com/owner/name',
	hasGhCli: () => false,
	githubToken: () => 'tok',
	readConfig: async () => undefined,
	configPath: 'delendai.config.json',
	...over,
});

describe('buildSetupGithubReport', async () => {
	it('detects context and renders the guide', async () => {
		const { context, guide } = await buildSetupGithubReport(deps());
		expect(context).toEqual({
			repo: 'owner/name',
			tier: 'rest-authed',
			configured: false,
			configPath: 'delendai.config.json',
		});
		expect(guide).toContain('# GitHub issues — setup guide');
		expect(guide).toContain('owner/name');
	});
});
