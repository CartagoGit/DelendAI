/**
 * land-identity-push.helper.ts — the one way the integrator writes to the
 * forge with git: as the project's identity, never as the checkout's own
 * credential (the workflow token, which is read-only here and starts no
 * workflow). A missing token is a refusal, not a fallback.
 */
// effect-boundary-authorized: the integrator's git adapter; the one place its pushes leave the clone
import { execFileSync } from 'node:child_process';

import { gitFailureText, landGitArgs } from './land-git-process.helper';

/**
 * The environment that makes git authenticate as `token`: the checkout's
 * own credential is reset and replaced. It is an environment, never an
 * argument, so the token is in no command line.
 */
export const identityPushEnv = (
	token: string,
	host = 'https://github.com/',
): NodeJS.ProcessEnv => ({
	GIT_CONFIG_COUNT: '2',
	GIT_CONFIG_KEY_0: `http.${host}.extraheader`,
	GIT_CONFIG_VALUE_0: '',
	GIT_CONFIG_KEY_1: `http.${host}.extraheader`,
	GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
});

/** The environment for a git call that reads the forge as the identity; none without a token. */
export const identityFetchEnv = (
	token: string,
): NodeJS.ProcessEnv | undefined =>
	token === '' ? undefined : identityPushEnv(token);

/**
 * `git push` of `refspec` from `cwd`, as the identity. `undefined` when it
 * succeeded, else git's stderr; without a token nothing is pushed.
 */
export const pushAsIdentity = (input: {
	readonly cwd: string;
	readonly remote: string;
	readonly refspec: string;
	readonly token: string;
	readonly force?: boolean;
}): string | undefined => {
	if (input.token === '')
		return 'no identity token: the integrator never pushes with the checkout credential';
	try {
		execFileSync(
			'git',
			landGitArgs([
				'push',
				'-q',
				...(input.force === true ? ['--force'] : []),
				'--',
				input.remote,
				input.refspec,
			]),
			{
				cwd: input.cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, ...identityPushEnv(input.token) },
			},
		);
		return undefined;
	} catch (error) {
		return gitFailureText(error);
	}
};
