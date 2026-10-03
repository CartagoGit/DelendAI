import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IPublishTarballsInput } from './publish-tarballs.ts';
import { assertTarballsProvided, publishTarballs } from './publish-tarballs.ts';

interface IFakeChild extends EventEmitter {
	readonly stderr: PassThrough;
	readonly stdout: PassThrough;
}

const createChild = (exitCode: number): IFakeChild => {
	const child = new EventEmitter() as IFakeChild;
	Object.assign(child, {
		stderr: new PassThrough(),
		stdout: new PassThrough(),
	});
	queueMicrotask(() => {
		child.emit('close', exitCode);
	});
	return child;
};

const baseInput = (
	overrides?: Partial<IPublishTarballsInput>,
): IPublishTarballsInput => ({
	pkgDir: '/tmp/pkg',
	tarballPaths: ['/tmp/pkg-1.0.0.tgz'],
	tool: 'npm',
	registry: undefined,
	...overrides,
});

const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
	spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('publish-tarballs', () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it('assertTarballsProvided throws code missing-tarballs for npm without tarballs', async () => {
		expect(() =>
			assertTarballsProvided(
				baseInput({ tool: 'npm', tarballPaths: [] }),
			),
		).toThrowError(expect.objectContaining({ code: 'missing-tarballs' }));
	});

	it('assertTarballsProvided is a no-op for bun without tarballs', async () => {
		expect(() =>
			assertTarballsProvided(
				baseInput({ tool: 'bun', tarballPaths: [] }),
			),
		).not.toThrow();
	});

	it('publishTarballs with npm spawns npm publish for the tarball path', async () => {
		spawnMock.mockImplementation(() => createChild(0));

		const tarballPath = '/tmp/pkg-1.0.0.tgz';
		const result = await publishTarballs(
			baseInput({ tarballPaths: [tarballPath], tool: 'npm' }),
		);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(
			'npm',
			expect.arrayContaining(['publish', tarballPath]),
			expect.objectContaining({ cwd: '/tmp/pkg' }),
		);
		expect(result).toEqual([
			{
				tool: 'npm',
				tarballPath,
				ok: true,
			},
		]);
	});
});
