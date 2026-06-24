/**
 * Specs for GitHub setup detection (f00030 S2). Pure functions + the
 * `runSetupGithub` composition driven by injected probes.
 */
import { describe, expect, it } from 'vitest';

import {
	isIssuesConfigured,
	parseGithubRepo,
	resolveTier,
	runSetupGithub,
	type IGithubSetupDeps,
} from '../../../src/lib/github-setup';

describe('parseGithubRepo', async () => {
	it('parses an https remote', async () => {
		expect(parseGithubRepo('https://github.com/owner/name.git')).toBe(
			'owner/name',
		);
		expect(parseGithubRepo('https://github.com/owner/name')).toBe(
			'owner/name',
		);
	});

	it('parses an ssh remote', async () => {
		expect(parseGithubRepo('git@github.com:owner/name.git')).toBe(
			'owner/name',
		);
	});

	it('returns null for non-github / empty remotes', async () => {
		expect(parseGithubRepo(null)).toBeNull();
		expect(parseGithubRepo('https://gitlab.com/owner/name')).toBeNull();
	});
});

describe('resolveTier', async () => {
	it('prefers gh, then token, then anon', async () => {
		expect(resolveTier(true, undefined)).toBe('gh');
		expect(resolveTier(true, 'tok')).toBe('gh');
		expect(resolveTier(false, 'tok')).toBe('token');
		expect(resolveTier(false, '')).toBe('anon');
		expect(resolveTier(false, undefined)).toBe('anon');
	});
});

describe('isIssuesConfigured', async () => {
	it('detects a declared issues plugin', async () => {
		expect(
			isIssuesConfigured('{"plugins":{"issues":{"options":{}}}}'),
		).toBe(true);
	});
	it('is false when absent / unparseable', async () => {
		expect(isIssuesConfigured('{"plugins":{"memory":{}}}')).toBe(false);
		expect(isIssuesConfigured(undefined)).toBe(false);
		expect(isIssuesConfigured('not json')).toBe(false);
	});
});

const deps = (over: Partial<IGithubSetupDeps> = {}): IGithubSetupDeps => ({
	originUrl: () => 'git@github.com:me/proj.git',
	hasGhCli: () => true,
	githubToken: () => undefined,
	readConfig: () => undefined,
	configPath: 'mcp-vertex.config.json',
	...over,
});

describe('runSetupGithub', async () => {
	it('composes context + steps + a rendered guide', async () => {
		const result = runSetupGithub(deps());
		expect(result.context).toEqual({
			repo: 'me/proj',
			tier: 'gh',
			configured: false,
			configPath: 'mcp-vertex.config.json',
		});
		expect(result.steps.length).toBeGreaterThan(0);
		expect(result.guide).toContain('me/proj');
		expect(result.guide).toContain('# GitHub issues — setup guide');
	});

	it('reflects the anonymous tier + missing repo in the guide', async () => {
		const result = runSetupGithub(
			deps({
				originUrl: () => null,
				hasGhCli: () => false,
				githubToken: () => undefined,
			}),
		);
		expect(result.context.tier).toBe('anon');
		expect(result.context.repo).toBeNull();
		expect(result.steps[0]?.id).toBe('auth');
	});
});
