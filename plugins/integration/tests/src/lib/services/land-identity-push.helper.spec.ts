import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { args: string[]; env: Record<string, string | undefined> }[] = [];
let fail: Error | undefined;

vi.mock('node:child_process', () => ({
	execFileSync: (
		_command: string,
		args: string[],
		options: { env: Record<string, string | undefined> },
	): string => {
		sent.push({ args, env: options.env });
		if (fail !== undefined) throw fail;
		return '';
	},
}));

const { identityFetchEnv, identityPushEnv, pushAsIdentity } = await import(
	'../../../../src/lib/services/land-identity-push.helper'
);

const input = {
	cwd: '/clone',
	remote: 'origin',
	refspec: 'HEAD:refs/heads/x',
	token: 't',
};

beforeEach(() => {
	sent.length = 0;
	fail = undefined;
});

describe('the identity push', () => {
	it('[<20ms] refuses without a token and spawns nothing', () => {
		expect(pushAsIdentity({ ...input, token: '' })).toContain(
			'no identity token',
		);
		expect(sent).toEqual([]);
	});

	it('[<20ms] pushes hook-free as the identity, forced only when asked', () => {
		expect(pushAsIdentity({ ...input, force: true })).toBeUndefined();
		expect(pushAsIdentity(input)).toBeUndefined();
		expect(sent[0]?.args).toEqual([
			'-c',
			'core.hooksPath=/dev/null',
			'push',
			'-q',
			'--force',
			'--',
			'origin',
			'HEAD:refs/heads/x',
		]);
		expect(sent[1]?.args).not.toContain('--force');
		expect(sent[0]?.env.GIT_CONFIG_VALUE_1).toContain('AUTHORIZATION');
	});

	it('[<20ms] reports what a refusing hook said on stdout and stderr', () => {
		fail = Object.assign(new Error('x'), {
			stdout: 'hook: no\n',
			stderr: 'rejected\n',
		});
		expect(pushAsIdentity(input)).toBe('hook: no\nrejected');
	});

	it('[<20ms] reads the forge as the identity only with a token', () => {
		expect(identityFetchEnv('')).toBeUndefined();
		expect(identityFetchEnv('t')).toEqual(identityPushEnv('t'));
	});
});
