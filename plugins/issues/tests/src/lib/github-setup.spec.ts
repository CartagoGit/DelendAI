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

describe('parseGithubRepo', () => {
	it('parses an https remote', () => {
		expect(parseGithubRepo('https://github.com/owner/name.git')).toBe(
			'owner/name',
		);
		expect(parseGithubRepo('https://github.com/owner/name')).toBe(
			'owner/name',
		);
	});

	it('parses an ssh remote', () => {
		expect(parseGithubRepo('git@github.com:owner/name.git')).toBe(
			'owner/name',
		);
	});

	it('returns null for non-github / empty remotes', () => {
		expect(parseGithubRepo(null)).toBeNull();
		expect(parseGithubRepo('https://gitlab.com/owner/name')).toBeNull();
	});
});

describe('resolveTier', () => {
	it('prefers gh, then token, then anon', () => {
		expect(resolveTier(true, undefined)).toBe('gh');
		expect(resolveTier(true, 'tok')).toBe('gh');
		expect(resolveTier(false, 'tok')).toBe('token');
		expect(resolveTier(false, '')).toBe('anon');
		expect(resolveTier(false, undefined)).toBe('anon');
	});
});

describe('isIssuesConfigured', () => {
	it('detects a declared issues plugin', () => {
		expect(
			isIssuesConfigured('{"plugins":{"issues":{"options":{}}}}'),
		).toBe(true);
	});
	it('is false when absent / unparseable', () => {
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

describe('runSetupGithub', () => {
	it('composes context + steps + a rendered guide', () => {
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

	it('reflects the anonymous tier + missing repo in the guide', () => {
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
