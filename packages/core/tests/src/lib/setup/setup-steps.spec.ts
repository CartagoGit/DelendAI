/**
 * Specs for the agnostic setup-step engine (f00030 S2).
 */
import { describe, expect, it } from 'vitest';

import {
	buildGithubSetupSteps,
	type IGithubSetupContext,
} from '../../../../src/lib/setup/setup-steps';

const ctx = (over: Partial<IGithubSetupContext> = {}): IGithubSetupContext => ({
	repo: 'owner/name',
	tier: 'gh',
	configured: false,
	configPath: 'mcp-vertex.config.json',
	...over,
});

describe('buildGithubSetupSteps', () => {
	it('omits the auth step on the gh tier', () => {
		const ids = buildGithubSetupSteps(ctx({ tier: 'gh' })).map((s) => s.id);
		expect(ids).toEqual(['config', 'load', 'verify']);
	});

	it('adds a required auth step on the anonymous tier', () => {
		const steps = buildGithubSetupSteps(ctx({ tier: 'anon' }));
		const auth = steps.find((s) => s.id === 'auth');
		expect(auth).toBeDefined();
		expect(auth?.optional).not.toBe(true);
		expect(steps[0]?.id).toBe('auth');
	});

	it('adds an optional auth step on the token tier', () => {
		const auth = buildGithubSetupSteps(ctx({ tier: 'token' })).find(
			(s) => s.id === 'auth',
		);
		expect(auth?.optional).toBe(true);
	});

	it('embeds the detected repo into the config step', () => {
		const config = buildGithubSetupSteps(ctx({ repo: 'me/proj' })).find(
			(s) => s.id === 'config',
		);
		expect(config?.command).toContain('me/proj');
	});

	it('falls back to a placeholder repo when none was detected', () => {
		const config = buildGithubSetupSteps(ctx({ repo: null })).find(
			(s) => s.id === 'config',
		);
		expect(config?.command).toContain('<owner>/<name>');
	});

	it('reframes the config step when issues is already configured', () => {
		const config = buildGithubSetupSteps(ctx({ configured: true })).find(
			(s) => s.id === 'config',
		);
		expect(config?.title.toLowerCase()).toContain('confirm');
	});

	it('always loads proposals + issues together (hard dependency)', () => {
		const load = buildGithubSetupSteps(ctx()).find((s) => s.id === 'load');
		expect(load?.command).toContain('proposals,issues');
	});
});
