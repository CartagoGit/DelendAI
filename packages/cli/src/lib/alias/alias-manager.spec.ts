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
import { describe, expect, it } from 'vitest';

import {
	ALIAS_MARKER,
	aliasPaths,
	installAlias,
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
	it('writes both Windows shims, because one is not enough', () => {
		// A bare extensionless file is not runnable from cmd, and a .cmd
		// alone is invisible to PowerShell callers. Shipping one of the two
		// is the "Unix-only solution wearing a hat" the plan forbids.
		const io = ioOver({});
		expect(aliasPaths('est', WINDOWS, io)).toEqual([
			'C:\\bin/est.cmd',
			'C:\\bin/est.ps1',
		]);
	});

	it('writes a single file on POSIX', () => {
		const io = ioOver({});
		expect(aliasPaths('est', POSIX, io)).toEqual(['/usr/local/bin/est']);
	});

	it('marks everything it renders, on every platform', () => {
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
	it('creates the alias when the name is free', async () => {
		const io = ioOver({});
		const outcome = await installAlias('est', POSIX, io);
		expect(outcome.action).toBe('created');
		expect(io.files['/usr/local/bin/est']).toContain(POSIX.canonicalPath);
	});

	it('is idempotent: a second run changes nothing', async () => {
		const io = ioOver({});
		await installAlias('est', POSIX, io);
		const before = { ...io.files };
		const second = await installAlias('est', POSIX, io);
		expect(second.action).toBe('unchanged');
		expect(io.files).toEqual(before);
	});

	it('refuses a name held by other software and does not touch it', async () => {
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

	it('treats an unreadable name as foreign rather than replacing it', async () => {
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

	it('reports a write failure without failing the install', async () => {
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

	it('creates both shims on Windows', async () => {
		const io = ioOver({});
		const outcome = await installAlias('est', WINDOWS, io);
		expect(outcome.action).toBe('created');
		expect(Object.keys(io.files).sort()).toEqual([
			'C:\\bin/est.cmd',
			'C:\\bin/est.ps1',
		]);
	});

	it('marks a POSIX alias executable', async () => {
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
	it('recognises its own alias by the marker, not by the path', async () => {
		const io = ioOver({
			'/usr/local/bin/est': renderAlias('/usr/local/bin/est', POSIX),
		});
		expect((await readAliasState('est', POSIX, io)).state).toBe('ours');
	});

	it('names what holds a foreign alias, so doctor can say', async () => {
		const io = ioOver({
			'/usr/local/bin/est': '#!/usr/bin/env python\nprint("other")\n',
		});
		const status = await readAliasState('est', POSIX, io);
		expect(status.state).toBe('foreign');
		expect(status.occupiedBy).toBe('#!/usr/bin/env python');
	});
});

describe('removeAlias', () => {
	it('removes only what it created', async () => {
		const io = ioOver({});
		await installAlias('est', POSIX, io);
		const outcome = await removeAlias('est', POSIX, io);
		expect(outcome.action).toBe('created');
		expect(io.files['/usr/local/bin/est']).toBeUndefined();
	});

	it('refuses to remove a foreign alias', async () => {
		const foreign = 'other tool\n';
		const io = ioOver({ '/usr/local/bin/est': foreign });
		const outcome = await removeAlias('est', POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(io.files['/usr/local/bin/est']).toBe(foreign);
	});

	it('is a no-op when there is nothing to remove', async () => {
		const io = ioOver({});
		expect((await removeAlias('est', POSIX, io)).action).toBe('unchanged');
	});
});
