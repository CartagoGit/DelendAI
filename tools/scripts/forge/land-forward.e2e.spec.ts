/**
 * land-forward.e2e.spec.ts — the integrator brings a head forward with a
 * plain merge pushed without force, and authenticates its push by
 * environment, never by argument. Real git against a local forge.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { createBringForward, identityPushEnv } from './land-forward';

const template = createGitRepoTemplate({
	trunk: 'develop',
	remote: true,
	files: { 'a.ts': 'a\n', 'b.ts': 'b\n' },
});

const pull = (headRef: string, headSha: string) => ({
	number: 5,
	headRef,
	headSha,
	draft: false,
	state: 'open' as const,
	merged: false,
	labels: [],
	body: '',
	testedBase: 'x',
});

/** A head from the base touching `file`, and a tip that moved by `other`. */
const world = (file: string, other: string) => {
	const { root, git } = template.copy();
	const base = git('rev-parse', 'HEAD');
	const headRef = 'delendai/pr/a/implement/x1-S1-g1/t';
	git('switch', '-q', '-c', headRef, base);
	writeFileSync(join(root, file), 'head\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'head');
	git('push', '-q', 'origin', headRef);
	const headSha = git('rev-parse', headRef);
	git('switch', '-q', 'develop');
	writeFileSync(join(root, other), 'tip\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'tip');
	git('push', '-q', 'origin', 'develop');
	return { root, git, headRef, headSha, tip: git('rev-parse', 'HEAD') };
};

describe('createBringForward', () => {
	it('[<5000ms] merges the tip into the head and pushes it without force', async () => {
		const { root, git, headRef, headSha, tip } = world('a.ts', 'b.ts');
		const bring = createBringForward({
			root,
			remote: 'origin',
			token: 't',
		});
		expect(await bring(pull(headRef, headSha), tip)).toBe('brought');
		const pushed = git(
			'ls-remote',
			'origin',
			`refs/heads/${headRef}`,
		).split(/\s/u)[0];
		expect(pushed).not.toBe(headSha);
		git('fetch', '-q', 'origin', headRef);
		expect(
			git('merge-base', '--is-ancestor', headSha, `origin/${headRef}`),
		).toBe('');
		expect(
			git('merge-base', '--is-ancestor', tip, `origin/${headRef}`),
		).toBe('');
	});

	it('[<5000ms] leaves a head that conflicts in authored code to its author', async () => {
		const { root, git, headRef, headSha, tip } = world('a.ts', 'a.ts');
		const bring = createBringForward({
			root,
			remote: 'origin',
			token: 't',
		});
		expect(await bring(pull(headRef, headSha), tip)).toBe('conflict');
		expect(
			git('ls-remote', 'origin', `refs/heads/${headRef}`).split(/\s/u)[0],
		).toBe(headSha);
	});
});

describe('identityPushEnv', () => {
	it('[<5ms] resets the checkout credential and sets the identity by environment only', () => {
		const env = identityPushEnv('secret');
		expect(env.GIT_CONFIG_VALUE_0).toBe('');
		expect(env.GIT_CONFIG_VALUE_1).toContain(
			Buffer.from('x-access-token:secret').toString('base64'),
		);
		expect(
			Object.keys(env).every((key) => key.startsWith('GIT_CONFIG_')),
		).toBe(true);
	});
});
