import type { IProviderAccount } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import {
	accountApiCredential,
	accountEnvironment,
} from '../../../../src/lib/services/account-environment.service';

const parentEnv = {
	PATH: '/usr/bin',
	HOME: '/home/someone',
	LC_ALL: 'C.UTF-8',
	ANTHROPIC_API_KEY: 'server-key',
	GITHUB_TOKEN: 'server-token',
	WORK_KEY: 'work-key',
};

const account = (
	overrides: Partial<IProviderAccount> = {},
): IProviderAccount => ({
	accountId: 'claude-work',
	vendor: 'anthropic',
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
	profileDir: '/profiles/claude-work',
	quotaGroups: [],
	permittedAutomation: true,
	...overrides,
});

const run = (
	command: string,
	args: string[],
	on: IProviderAccount | undefined,
	accountId = on?.accountId,
) =>
	accountEnvironment({
		workspaceRoot: '/work',
		command,
		args,
		account: on,
		accountId,
		parentEnv,
	});

describe('accountEnvironment', () => {
	it('runs an entry with no account and no names on what any program needs only', () => {
		expect(run('claude', ['-p'], undefined)).toEqual({
			kind: 'isolated',
			env: { PATH: '/usr/bin', HOME: '/home/someone', LC_ALL: 'C.UTF-8' },
		});
	});

	it('runs an entry with no account on what it names, not on the whole environment', () => {
		expect(
			accountEnvironment({
				workspaceRoot: '/work',
				command: 'aider',
				args: [],
				account: undefined,
				accountId: undefined,
				parentEnv,
				named: ['WORK_KEY', 'NOT_SET'],
			}),
		).toEqual({
			kind: 'isolated',
			env: {
				PATH: '/usr/bin',
				HOME: '/home/someone',
				LC_ALL: 'C.UTF-8',
				WORK_KEY: 'work-key',
			},
		});
	});

	it('gives an account only the base variables and its own profile directory', () => {
		expect(run('/usr/local/bin/claude', ['-p'], account())).toEqual({
			kind: 'isolated',
			env: {
				PATH: '/usr/bin',
				HOME: '/home/someone',
				LC_ALL: 'C.UTF-8',
				CLAUDE_CONFIG_DIR: '/profiles/claude-work',
			},
		});
		const codex = run(
			'codex',
			['exec'],
			account({
				accountId: 'codex-a',
				vendor: 'openai',
				profileDir: '/homes/a',
			}),
		);
		expect(codex.kind === 'isolated' && codex.env.CODEX_HOME).toBe(
			'/homes/a',
		);
	});

	it('passes the credential variable the account names, and no other', () => {
		const result = run(
			'claude',
			['-p'],
			account({
				credentialMode: 'byok-api-key',
				billingMode: 'pay-as-you-go',
				credentialEnv: 'WORK_KEY',
			}),
		);
		expect(result.kind === 'isolated' && result.env.WORK_KEY).toBe(
			'work-key',
		);
		expect(
			result.kind === 'isolated' && 'ANTHROPIC_API_KEY' in result.env,
		).toBe(false);
	});

	it('refuses before spawning what would break the account apart', () => {
		const reasons = [
			run('claude', ['-p'], undefined, 'nobody'),
			run('claude', ['-p'], account({ permittedAutomation: false })),
			run('claude', ['-p', '--bare'], account()),
			run('aider', ['--message'], account()),
			run('claude', ['-p'], account({ credentialEnv: 'UNSET_KEY' })),
		].map((result) =>
			result.kind === 'refused' ? result.reason : result.kind,
		);
		expect(reasons).toEqual([
			'account "nobody" is not in the account registry',
			'account "claude-work" is not open to unattended work (permittedAutomation is false)',
			'claude --bare ignores the subscription login of account "claude-work"',
			'aider has no known way to keep account "claude-work" in its own profile directory',
			'account "claude-work" names credential variable UNSET_KEY, which is not set',
		]);
	});
});

describe('accountApiCredential', () => {
	const call = (
		on: IProviderAccount | undefined,
		accountId = on?.accountId,
	) =>
		accountApiCredential({
			envVar: 'ANTHROPIC_API_KEY',
			account: on,
			accountId,
			parentEnv,
		});

	it('reads the entry variable for no account, and the account variable on one', () => {
		expect(call(undefined)).toEqual({ kind: 'key', key: 'server-key' });
		expect(
			call(
				account({
					credentialMode: 'byok-api-key',
					credentialEnv: 'WORK_KEY',
				}),
			),
		).toEqual({ kind: 'key', key: 'work-key' });
	});

	it('refuses what the account policy forbids', () => {
		expect(call(undefined, 'ghost')).toMatchObject({ kind: 'refused' });
		expect(
			call(
				account({
					credentialMode: 'byok-api-key',
					permittedAutomation: false,
				}),
			),
		).toMatchObject({ kind: 'refused' });
		expect(
			call(account({ credentialMode: 'official-subscription-login' })),
		).toMatchObject({ kind: 'refused' });
	});
});
