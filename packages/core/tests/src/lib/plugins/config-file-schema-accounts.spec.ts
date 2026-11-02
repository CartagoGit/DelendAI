import { describe, expect, it } from 'vitest';

import { CONFIG_FILE_SCHEMA } from '@delendai/core/lib/plugins/config-file-schema';

const account = (accountId: string, profileDir: string) => ({
	accountId,
	vendor: 'openai',
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
	profileDir,
	quotaGroups: [`${accountId}-5h`],
});

const provider = (id: string, accountId?: string) => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: 'codex' },
	modelId: 'gpt-5-codex',
	contextWindow: 200_000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
	...(accountId === undefined ? {} : { accountId }),
});

const messages = (input: unknown): string[] => {
	const res = CONFIG_FILE_SCHEMA.safeParse(input);
	return res.success ? [] : res.error.issues.map((issue) => issue.message);
};

describe('config-file-schema — root accounts', () => {
	it('accepts two accounts of one vendor, and a roster entry without one', () => {
		expect(
			messages({
				accounts: [
					account('codex-a', '/homes/a'),
					account('codex-b', '/homes/b'),
				],
				providers: [
					provider('codex-on-a', 'codex-a'),
					provider('codex-on-b', 'codex-b'),
					provider('codex-legacy'),
				],
			}),
		).toEqual([]);
	});

	it('refuses the same things the roster plugins receive refuses', () => {
		expect(
			messages({
				accounts: [
					account('codex-a', '/homes/a'),
					account('codex-b', '/homes/a/'),
				],
				providers: [provider('codex-on-z', 'codex-z')],
			}),
		).toEqual([
			'account "codex-b" shares profile directory "/homes/a/" with "codex-a"',
			'provider "codex-on-z" names undeclared account "codex-z"',
		]);
	});

	it('takes the name of a credential variable, never a literal secret', () => {
		expect(
			messages({
				accounts: [
					{
						...account('codex-a', '/homes/a'),
						credentialEnv: 'OPENAI_API_KEY',
					},
				],
			}),
		).toEqual([]);
		expect(
			messages({
				accounts: [
					{
						...account('codex-a', '/homes/a'),
						credentialEnv: 'sk-proj-abc',
					},
				],
			}),
		).toHaveLength(1);
	});
});
