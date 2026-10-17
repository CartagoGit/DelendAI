import type { IProviderAccount } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import { accountEnvironment } from '../../../../src/lib/services/account-environment.service';

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
) => accountEnvironment({ command, args, account: on, accountId, parentEnv });

describe('accountEnvironment', () => {
	it('keeps the server environment for an entry with no account', () => {
		expect(run('claude', ['-p'], undefined)).toEqual({ kind: 'inherit' });
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
