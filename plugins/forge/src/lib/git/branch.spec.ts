import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { getCurrentBranch, getDefaultBranch, type ISpawnLike } from './branch';

const makeSpawn = (
	stdout: string,
	stderr = '',
	exitCode = 0,
	collector?: string[][],
): ISpawnLike =>
	((command, args) => {
		collector?.push([command, ...args]);
		const out = new PassThrough();
		const err = new PassThrough();
		const listeners: Record<string, ((value: unknown) => void)[]> = {};
		queueMicrotask(() => {
			if (stdout.length > 0) out.write(stdout);
			out.end();
			if (stderr.length > 0) err.write(stderr);
			err.end();
			for (const listener of listeners.close ?? []) {
				listener(exitCode);
			}
		});
		return {
			stdout: out,
			stderr: err,
			on(event, listener) {
				listeners[event] ??= [];
				listeners[event]?.push(listener as (value: unknown) => void);
				return this;
			},
			kill() {
				return true;
			},
		};
	}) as ISpawnLike;

describe('branch helpers', () => {
	it('reads the current branch', async () => {
		const calls: string[][] = [];
		await expect(
			getCurrentBranch('/ws', {
				spawnFn: makeSpawn('feat/forge-write\n', '', 0, calls),
			}),
		).resolves.toBe('feat/forge-write');
		expect(calls).toEqual([['git', 'branch', '--show-current']]);
	});

	it('reads the default branch from origin HEAD', async () => {
		await expect(
			getDefaultBranch('/ws', {
				spawnFn: makeSpawn('refs/remotes/origin/develop\n'),
			}),
		).resolves.toBe('develop');
	});

	it('surfaces git failures', async () => {
		await expect(
			getCurrentBranch('/ws', {
				spawnFn: makeSpawn('', 'not a git repository', 1),
			}),
		).rejects.toThrow('not a git repository');
	});

	it('keeps non-origin refs untouched when parsing fails to match', async () => {
		await expect(
			getDefaultBranch('/ws', {
				spawnFn: makeSpawn('refs/heads/main\n'),
			}),
		).resolves.toBe('refs/heads/main');
	});
});
