import { describe, expect, it } from 'vitest';

import { validProviderRoster } from '../../../../src/lib/plugins/provider-roster.helper';

const provider = (id: string) => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id },
	modelId: `${id}-model`,
	contextWindow: 200_000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

const account = (
	accountId: string,
	profileDir: string,
	quotaGroups: string[],
) => ({
	accountId,
	vendor: 'anthropic',
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
	profileDir,
	quotaGroups,
});

describe('validProviderRoster', () => {
	it('is empty when the configuration declares no roster', () => {
		expect(validProviderRoster(undefined)).toEqual({
			providers: [],
			accounts: [],
			rejected: [],
		});
	});

	it('keeps the valid entries in order and names each one it leaves out', () => {
		const roster = validProviderRoster([
			provider('alpha'),
			{ ...provider('beta'), costTier: 9 },
			provider('alpha'),
			'not an entry',
			provider('gamma'),
		]);
		expect(roster.providers.map((entry) => entry.id)).toEqual([
			'alpha',
			'gamma',
		]);
		expect(roster.rejected.map((entry) => [entry.index, entry.id])).toEqual(
			[
				[1, 'beta'],
				[2, 'alpha'],
				[3, undefined],
			],
		);
		expect(roster.rejected[1]?.reason).toContain('duplicate');
	});

	it('keeps two accounts of one vendor apart and runs each model on its own', () => {
		const roster = validProviderRoster(
			[
				{ ...provider('opus-work'), accountId: 'claude-work' },
				{ ...provider('sonnet-work'), accountId: 'claude-work' },
				{ ...provider('opus-home'), accountId: 'claude-home' },
			],
			[
				account('claude-work', '/profiles/work', [
					'work-5h',
					'work-week',
				]),
				account('claude-home', '/profiles/home', ['home-5h']),
			],
		);
		expect(roster.rejected).toEqual([]);
		expect(roster.accounts.map((entry) => entry.accountId)).toEqual([
			'claude-work',
			'claude-home',
		]);
		expect(
			roster.providers.map((entry) => [entry.id, entry.accountId]),
		).toEqual([
			['opus-work', 'claude-work'],
			['sonnet-work', 'claude-work'],
			['opus-home', 'claude-home'],
		]);
		expect(roster.accounts[0]?.permittedAutomation).toBe(false);
	});

	it('leaves out an account the registry refuses, and every model on it', () => {
		const roster = validProviderRoster(
			[
				{ ...provider('opus-a'), accountId: 'claude-a' },
				{ ...provider('opus-b'), accountId: 'claude-b' },
				{ ...provider('opus-c'), accountId: 'claude-c' },
				{ ...provider('opus-x'), accountId: 'nobody' },
			],
			[
				account('claude-a', '/profiles/a/', ['a-5h']),
				account('claude-b', '/profiles/a', []),
				account('claude-c', '/profiles/c', ['a-5h']),
				account('claude-a', '/profiles/d', []),
				{
					...account('claude-e', '/profiles/e', []),
					credentialEnv: 'sk-literal',
				},
			],
		);
		expect(roster.accounts.map((entry) => entry.accountId)).toEqual([
			'claude-a',
		]);
		expect(roster.providers.map((entry) => entry.id)).toEqual(['opus-a']);
		expect(
			roster.rejected.map((entry) => [
				entry.block,
				entry.index,
				entry.id,
			]),
		).toEqual([
			['accounts', 1, 'claude-b'],
			['accounts', 2, 'claude-c'],
			['accounts', 3, 'claude-a'],
			['accounts', 4, 'claude-e'],
			['providers', 1, 'opus-b'],
			['providers', 2, 'opus-c'],
			['providers', 3, 'opus-x'],
		]);
		expect(roster.rejected[0]?.reason).toContain('profile directory');
		expect(roster.rejected[1]?.reason).toContain('quota group "a-5h"');
		expect(roster.rejected[2]?.reason).toContain('duplicate account id');
	});
});
