import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../..', import.meta.url).pathname;
const SCRIPT = join(
	REPO_ROOT,
	'tools/scripts/lint/push-to-develop-discipline.script.ts',
);

const REMOTE_NAME = 'origin';
const REMOTE_URL = 'git@github.com:CartagoGit/delendai.git';
const LOCAL_SHA = 'a'.repeat(40);
const REMOTE_SHA = 'b'.repeat(40);

const prePushLine = (localBranch: string, remoteBranch: string): string =>
	[
		`refs/heads/${localBranch}`,
		LOCAL_SHA,
		`refs/heads/${remoteBranch}`,
		REMOTE_SHA,
	].join(' ');

const runGuard = (
	stdin: string,
	env?: Record<string, string>,
): ReturnType<typeof spawnSync> =>
	spawnSync('bun', [SCRIPT, REMOTE_NAME, REMOTE_URL], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		input: stdin,
		env: env === undefined ? process.env : { ...process.env, ...env },
	});

describe('push-to-develop-discipline pre-push e2e', () => {
	it('blocks a direct push to main from real pre-push stdin without bypass', () => {
		const result = runGuard(`${prePushLine('develop', 'main')}\n`);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('push-to-develop-discipline: blocked');
		expect(result.stderr).toContain('ADR 0019');
		expect(result.stderr).toContain('LEFTHOOK_BYPASS=1');
		expect(result.stdout).toBe('');
	});

	it('allows the same push to main when LEFTHOOK_BYPASS=1 is set', () => {
		const result = runGuard(`${prePushLine('develop', 'main')}\n`, {
			LEFTHOOK_BYPASS: '1',
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			'push-to-develop-discipline: bypassed (LEFTHOOK_BYPASS=1)',
		);
		expect(result.stderr).toBe('');
	});

	it('keeps develop -> develop allowed through the real stdin path', () => {
		const result = runGuard(`${prePushLine('develop', 'develop')}\n`);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('push-to-develop-discipline: ok');
		expect(result.stderr).toBe('');
	});
});
