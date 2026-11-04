import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	detectPackageManager,
	lockfilesForPackageManager,
	primaryLockfileForPackageManager,
	type IPackageManagerProbe,
} from '@delendai/core/lib/workspace-migration/package-manager/detect-package-manager';
import {
	commandForPackageManager,
	createLockfileRefreshIo,
	refreshLockfile,
	type ILockfileRefreshIO,
	type ILockfileRefreshRunner,
} from '@delendai/core/lib/workspace-migration/package-manager/lockfile-refresh';

const probe = (files: Record<string, string>): IPackageManagerProbe => ({
	exists: async (relativePath) => relativePath in files,
});

const createInMemoryRefreshIo = (
	seed: Record<string, string>,
): ILockfileRefreshIO & { readonly files: Map<string, string> } => {
	const files = new Map(Object.entries(seed));
	return {
		files,
		exists: async (absolutePath) => files.has(absolutePath),
		read: async (absolutePath) => files.get(absolutePath) ?? null,
		write: async (absolutePath, content) => {
			files.set(absolutePath, content);
		},
		remove: async (absolutePath) => {
			files.delete(absolutePath);
		},
	};
};

describe('detectPackageManager (b00239 S7)', () => {
	it('detects bun from bun.lock', async () => {
		expect(
			await detectPackageManager('/workspace', probe({ 'bun.lock': '' })),
		).toBe('bun');
	});

	it('detects bun from bun.lockb', async () => {
		expect(
			await detectPackageManager(
				'/workspace',
				probe({ 'bun.lockb': 'binary' }),
			),
		).toBe('bun');
	});

	it('detects pnpm from pnpm-lock.yaml', async () => {
		expect(
			await detectPackageManager(
				'/workspace',
				probe({ 'pnpm-lock.yaml': '' }),
			),
		).toBe('pnpm');
	});

	it('detects yarn from yarn.lock', async () => {
		expect(
			await detectPackageManager(
				'/workspace',
				probe({ 'yarn.lock': '' }),
			),
		).toBe('yarn');
	});

	it('detects npm from package-lock.json', async () => {
		expect(
			await detectPackageManager(
				'/workspace',
				probe({ 'package-lock.json': '' }),
			),
		).toBe('npm');
	});

	it('prioritizes bun over npm when both lockfiles are present', async () => {
		expect(
			await detectPackageManager(
				'/workspace',
				probe({ 'bun.lock': '', 'package-lock.json': '' }),
			),
		).toBe('bun');
	});

	it('returns unknown when no supported lockfile is present', async () => {
		expect(await detectPackageManager('/workspace', probe({}))).toBe(
			'unknown',
		);
	});
});

describe('lockfile metadata', () => {
	it('returns the expected lockfile set and primary lockfile per manager', () => {
		expect(lockfilesForPackageManager('bun')).toEqual([
			'bun.lock',
			'bun.lockb',
		]);
		expect(primaryLockfileForPackageManager('bun')).toBe('bun.lock');
		expect(lockfilesForPackageManager('npm')).toEqual([
			'package-lock.json',
		]);
		expect(commandForPackageManager('bun')).toBe('bun install');
		expect(commandForPackageManager('pnpm')).toBe(
			'pnpm install --lockfile-only',
		);
		expect(commandForPackageManager('yarn')).toBe(
			'yarn install --mode=skip-build',
		);
		expect(commandForPackageManager('npm')).toBe(
			'npm install --package-lock-only',
		);
	});
});

describe('refreshLockfile (b00239 S7)', () => {
	it('refreshes successfully when the runner produces a lockfile', async () => {
		const workspaceRoot = '/workspace';
		const io = createInMemoryRefreshIo({
			[join(workspaceRoot, 'package.json')]: '{"name":"svc"}\n',
			[join(workspaceRoot, 'bun.lock')]: 'before\n',
		});
		const runner: ILockfileRefreshRunner = async (_command, options) => {
			await io.write(join(options.cwd, 'bun.lock'), 'after\n');
			return { code: 0, output: 'ok', timedOut: false };
		};

		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'bun',
			io,
			runner,
		});

		expect(result.status).toBe('refreshed');
		expect(await io.read(join(workspaceRoot, 'bun.lock'))).toBe('after\n');
		expect(result.restoredFiles).toEqual([]);
	});

	it('restores package.json and the lockfile when the runner fails', async () => {
		const workspaceRoot = '/workspace';
		const packageJsonPath = join(workspaceRoot, 'package.json');
		const lockfilePath = join(workspaceRoot, 'package-lock.json');
		const io = createInMemoryRefreshIo({
			[packageJsonPath]:
				'{"name":"svc","deps":{"@delendai/core":"workspace:*"}}\n',
			[lockfilePath]: '{"lockfileVersion":3,"name":"svc"}\n',
		});
		const runner: ILockfileRefreshRunner = async () => {
			await io.write(packageJsonPath, '{"name":"broken"}\n');
			await io.write(
				lockfilePath,
				'{"lockfileVersion":3,"name":"broken"}\n',
			);
			return { code: 1, output: 'resolution failed', timedOut: false };
		};

		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'npm',
			io,
			runner,
		});

		expect(result.status).toBe('rolled-back');
		expect(result.reason).toContain('exited with 1');
		expect(await io.read(packageJsonPath)).toBe(
			'{"name":"svc","deps":{"@delendai/core":"workspace:*"}}\n',
		);
		expect(await io.read(lockfilePath)).toBe(
			'{"lockfileVersion":3,"name":"svc"}\n',
		);
	});

	it('removes a brand-new lockfile when refresh fails after creating it', async () => {
		const workspaceRoot = '/workspace';
		const packageJsonPath = join(workspaceRoot, 'package.json');
		const lockfilePath = join(workspaceRoot, 'pnpm-lock.yaml');
		const io = createInMemoryRefreshIo({
			[packageJsonPath]: '{"name":"svc"}\n',
		});
		const runner: ILockfileRefreshRunner = async () => {
			await io.write(packageJsonPath, '{"name":"broken"}\n');
			await io.write(lockfilePath, 'lockfileVersion: 9\n');
			return { code: 42, output: 'solver exploded', timedOut: false };
		};

		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'pnpm',
			io,
			runner,
		});

		expect(result.status).toBe('rolled-back');
		expect(await io.read(packageJsonPath)).toBe('{"name":"svc"}\n');
		expect(await io.read(lockfilePath)).toBeNull();
	});

	it('rolls back when the package manager exits 0 but no lockfile exists afterwards', async () => {
		const workspaceRoot = '/workspace';
		const packageJsonPath = join(workspaceRoot, 'package.json');
		const io = createInMemoryRefreshIo({
			[packageJsonPath]: '{"name":"svc"}\n',
			[join(workspaceRoot, 'yarn.lock')]: 'before\n',
		});
		const runner: ILockfileRefreshRunner = async () => {
			await io.remove(join(workspaceRoot, 'yarn.lock'));
			return { code: 0, output: 'ok but weird', timedOut: false };
		};

		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'yarn',
			io,
			runner,
		});

		expect(result.status).toBe('rolled-back');
		expect(result.reason).toContain('no lockfile was produced');
		expect(await io.read(join(workspaceRoot, 'yarn.lock'))).toBe(
			'before\n',
		);
	});

	it('works end-to-end against the real filesystem adapter', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s7-lockfile-'),
		);
		await mkdir(workspaceRoot, { recursive: true });
		await writeFile(
			join(workspaceRoot, 'package.json'),
			'{"name":"svc"}\n',
		);
		await writeFile(
			join(workspaceRoot, 'package-lock.json'),
			'{"name":"svc"}\n',
		);
		const io = createLockfileRefreshIo();
		const runner: ILockfileRefreshRunner = async (_command, options) => {
			await writeFile(
				join(options.cwd, 'package-lock.json'),
				'{"name":"svc","fresh":true}\n',
			);
			return { code: 0, output: 'ok', timedOut: false };
		};

		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'npm',
			io,
			runner,
		});

		expect(result.status).toBe('refreshed');
		expect(
			await readFile(join(workspaceRoot, 'package-lock.json'), 'utf8'),
		).toBe('{"name":"svc","fresh":true}\n');
	});
});
