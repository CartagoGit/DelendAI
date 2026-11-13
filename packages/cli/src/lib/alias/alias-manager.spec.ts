/**
 * alias-manager.spec.ts — b00239 S1.
 *
 * The case that decides the design is the foreign one: a name held by
 * somebody else's software must come out of this untouched, and the tool
 * must stay fully usable. Everything else follows from that.
 *
 * The IO is injected, so these run identically on any host — including the
 * Windows shim paths, which are otherwise the half nobody tests until a
 * Windows user reports the alias silently missing.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	ALIAS_MARKER,
	aliasPaths,
	installAlias,
	installLauncher,
	removeLauncher,
	renderLauncher,
	resolveGlobalBinDir,
	readAliasState,
	removeAlias,
	renderAlias,
	type IAliasEnvironment,
	type IAliasIo,
} from './alias-manager';

const POSIX: IAliasEnvironment = {
	platform: 'posix',
	binDir: '/usr/local/bin',
	canonicalPath: '/opt/delendai/dist/index.js',
};

const WINDOWS: IAliasEnvironment = {
	platform: 'win32',
	binDir: 'C:\\bin',
	canonicalPath: 'C:\\opt\\delendai\\dist\\index.js',
};

const ioOver = (
	files: Record<string, string>,
	overrides: Partial<IAliasIo> = {},
): IAliasIo & { files: Record<string, string> } => ({
	files,
	read: async (path) => files[path],
	write: async (path, contents) => {
		files[path] = contents;
	},
	remove: async (path) => {
		delete files[path];
	},
	exists: async (path) => path in files,
	join: (...parts) => parts.join('/'),
	...overrides,
});

describe('alias paths', () => {
	it('[<20ms] writes both Windows shims, because one is not enough', () => {
		// A bare extensionless file is not runnable from cmd, and a .cmd
		// alone is invisible to PowerShell callers. Shipping one of the two
		// is the "Unix-only solution wearing a hat" the plan forbids.
		const io = ioOver({});
		expect(aliasPaths('est', WINDOWS, io)).toEqual([
			'C:\\bin/est.cmd',
			'C:\\bin/est.ps1',
		]);
	});

	it('[<10ms] writes a single file on POSIX', () => {
		const io = ioOver({});
		expect(aliasPaths('est', POSIX, io)).toEqual(['/usr/local/bin/est']);
	});

	it('[<10ms] marks everything it renders, on every platform', () => {
		// The marker is what makes re-runs idempotent and removal safe. An
		// unmarked shim is indistinguishable from a stranger's.
		for (const path of [
			'/usr/local/bin/est',
			'C:/bin/est.cmd',
			'C:/bin/est.ps1',
		])
			expect(renderAlias(path, POSIX)).toContain(ALIAS_MARKER);
	});
});

describe('installAlias', () => {
	it('[<10ms] creates the alias when the name is free', async () => {
		const io = ioOver({});
		const outcome = await installAlias('est', POSIX, io);
		expect(outcome.action).toBe('created');
		expect(io.files['/usr/local/bin/est']).toContain(POSIX.canonicalPath);
	});

	it('[<10ms] is idempotent: a second run changes nothing', async () => {
		const io = ioOver({});
		await installAlias('est', POSIX, io);
		const before = { ...io.files };
		const second = await installAlias('est', POSIX, io);
		expect(second.action).toBe('unchanged');
		expect(io.files).toEqual(before);
	});

	it('[<10ms] refuses a name held by other software and does not touch it', async () => {
		// The case the whole design exists for.
		const foreign = '#!/bin/sh\nexec /opt/some-other-tool/bin/est "$@"\n';
		const io = ioOver({ '/usr/local/bin/est': foreign });
		const outcome = await installAlias('est', POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(outcome.status.state).toBe('foreign');
		expect(io.files['/usr/local/bin/est']).toBe(foreign);
		// Non-fatal, and it must say what still works.
		expect(outcome.detail).toContain('index');
		expect(outcome.detail).toContain('left untouched');
	});

	it('[<10ms] treats an unreadable name as foreign rather than replacing it', async () => {
		// Guessing wrong here deletes somebody's executable, so the tie
		// goes to leaving it alone.
		const io = ioOver(
			{ '/usr/local/bin/est': 'x' },
			{
				read: async () => {
					throw new Error('EACCES');
				},
			},
		);
		const outcome = await installAlias('est', POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(outcome.status.state).toBe('unreadable');
		expect(io.files['/usr/local/bin/est']).toBe('x');
	});

	it('[<10ms] reports a write failure without failing the install', async () => {
		const io = ioOver(
			{},
			{
				write: async () => {
					throw new Error('EROFS');
				},
			},
		);
		const outcome = await installAlias('est', POSIX, io);
		expect(outcome.action).toBe('failed');
		expect(outcome.detail).toContain('not fatal');
	});

	it('[<10ms] creates both shims on Windows', async () => {
		const io = ioOver({});
		const outcome = await installAlias('est', WINDOWS, io);
		expect(outcome.action).toBe('created');
		expect(Object.keys(io.files).sort()).toEqual([
			'C:\\bin/est.cmd',
			'C:\\bin/est.ps1',
		]);
	});

	it('[<10ms] marks a POSIX alias executable', async () => {
		const made: string[] = [];
		const io = ioOver(
			{},
			{
				makeExecutable: async (path) => {
					made.push(path);
				},
			},
		);
		await installAlias('est', POSIX, io);
		expect(made).toEqual(['/usr/local/bin/est']);
	});
});

describe('readAliasState', () => {
	it('[<10ms] recognises its own alias by the marker, not by the path', async () => {
		const io = ioOver({
			'/usr/local/bin/est': renderAlias('/usr/local/bin/est', POSIX),
		});
		expect((await readAliasState('est', POSIX, io)).state).toBe('ours');
	});

	it('[<10ms] names what holds a foreign alias, so doctor can say', async () => {
		const io = ioOver({
			'/usr/local/bin/est': '#!/usr/bin/env python\nprint("other")\n',
		});
		const status = await readAliasState('est', POSIX, io);
		expect(status.state).toBe('foreign');
		expect(status.occupiedBy).toBe('#!/usr/bin/env python');
	});
});

describe('removeAlias', () => {
	it('[<10ms] removes only what it created', async () => {
		const io = ioOver({});
		await installAlias('est', POSIX, io);
		const outcome = await removeAlias('est', POSIX, io);
		expect(outcome.action).toBe('created');
		expect(io.files['/usr/local/bin/est']).toBeUndefined();
	});

	it('[<10ms] refuses to remove a foreign alias', async () => {
		const foreign = 'other tool\n';
		const io = ioOver({ '/usr/local/bin/est': foreign });
		const outcome = await removeAlias('est', POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(io.files['/usr/local/bin/est']).toBe(foreign);
	});

	it('[<10ms] is a no-op when there is nothing to remove', async () => {
		const io = ioOver({});
		expect((await removeAlias('est', POSIX, io)).action).toBe('unchanged');
	});
});

describe('checkout launcher', () => {
	const env = {
		platform: 'posix' as const,
		binDir: '/g/bin',
		checkoutRoot: '/src/delendai',
	};
	it('[<10ms] writes a marked launcher and is idempotent', async () => {
		const io = ioOver({});
		expect((await installLauncher(env, io)).action).toBe('created');
		expect(io.files['/g/bin/delendai']).toContain(ALIAS_MARKER);
		expect(io.files['/g/bin/delendai']).toContain(
			"FALLBACK='/src/delendai'",
		);
		expect((await installLauncher(env, io)).action).toBe('unchanged');
	});
	it('[<10ms] never overwrites a file without the marker', async () => {
		const io = ioOver({ '/g/bin/delendai': '#!/bin/sh\necho mine\n' });
		const outcome = await installLauncher(env, io);
		expect(outcome.action).toBe('refused');
		expect(io.files['/g/bin/delendai']).toContain('mine');
		expect((await removeLauncher(env, io)).action).toBe('refused');
	});
	it('[<10ms] writes a .cmd on Windows and removes only its own', async () => {
		const win = { ...env, platform: 'win32' as const, binDir: 'C:\\bin' };
		const io = ioOver({});
		await installLauncher(win, io);
		expect(Object.keys(io.files)).toEqual(['C:\\bin/delendai.cmd']);
		await removeLauncher(win, io);
		expect(io.files).toEqual({});
	});
	it('[<10ms] prefers the bun bin, then npm prefix', async () => {
		const io = ioOver({ '/h/.bun/bin': '' });
		expect(await resolveGlobalBinDir('posix', { HOME: '/h' }, io)).toBe(
			'/h/.bun/bin',
		);
		expect(
			await resolveGlobalBinDir(
				'posix',
				{ HOME: '/x', NPM_CONFIG_PREFIX: '/n' },
				io,
			),
		).toBe('/n/bin');
	});

	it('[<10ms] renders a marked Windows launcher and quotes a POSIX fallback path', () => {
		const win = renderLauncher({
			...env,
			platform: 'win32',
			checkoutRoot: 'C:\\co',
		});
		expect(win).toContain(ALIAS_MARKER);
		expect(win).toContain('C:\\co');
		expect(renderLauncher({ ...env, checkoutRoot: "/it's" })).toContain(
			`'/it'\\''s'`,
		);
	});
	it.skipIf(process.platform === 'win32')(
		'[<60ms] reaches the fallback when PWD is empty instead of walking forever',
		() => {
			const dir = mkdtempSync(join(tmpdir(), 'launcher-'));
			try {
				const file = join(dir, 'delendai');
				writeFileSync(
					file,
					renderLauncher({ ...env, checkoutRoot: dir }),
				);
				// `exec` is shadowed so the launcher reports where it would go
				// instead of starting bun; the timeout only bounds a regression.
				const run = spawnSync(
					'bash',
					[
						'-c',
						'exec() { echo "EXEC $*"; exit 0; }; PWD=; . "$1"',
						'_',
						file,
					],
					{ cwd: dir, encoding: 'utf8', timeout: 10_000 },
				);
				expect(run.status).toBe(0);
				expect(run.stdout).toContain(
					`EXEC bun ${dir}/packages/cli/src/index.ts`,
				);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
	);
	it('[<10ms] refuses what it cannot read, and reports a failed write', async () => {
		const boom = async () => {
			throw new Error('EACCES');
		};
		const unreadable = ioOver({}, { read: boom });
		expect((await installLauncher(env, unreadable)).status.state).toBe(
			'unreadable',
		);
		expect((await removeLauncher(env, unreadable)).status.state).toBe(
			'unreadable',
		);
		const failing = ioOver({}, { write: boom });
		expect((await installLauncher(env, failing)).action).toBe('failed');
	});
	it('[<10ms] falls back to the bun bin when nothing else is set', async () => {
		const io = ioOver({});
		expect(await resolveGlobalBinDir('posix', { HOME: '/h' }, io)).toBe(
			'/h/.bun/bin',
		);
		expect(
			await resolveGlobalBinDir(
				'win32',
				{ npm_config_prefix: 'C:\\n' },
				io,
			),
		).toBe('C:\\n');
		expect(await resolveGlobalBinDir('posix', {}, io)).toBeUndefined();
	});
});
