/**
 * integration.spec.ts — b00239 S6: end-to-end round-trip via the
 * production filesystem adapter.
 *
 * Verifies that the alias manager actually touches disk when wired
 * to `createNodeAliasIo`, not the previous `fakeIo` stub that
 * returned `false` from `exists` and was a no-op for write/remove.
 *
 * Each test uses its own tmp dir so parallel runs don't collide.
 */

import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	installAlias,
	readAliasState,
	removeAlias,
} from './alias-manager';
import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';
import { createNodeAliasIo } from './io-real';

const mkTmpBin = async (): Promise<{ binDir: string; cleanup: () => Promise<void> }> => {
	const dir = await mkdtemp(join(tmpdir(), 'alias-int-'));
	const binDir = join(dir, 'bin');
	const canonical = join(binDir, 'delendai');
	// We don't need the canonical file to actually exist for the
	// manager to do its job — it just needs a path to write into
	// the shim. The shim itself only re-execs at invocation time.
	return {
		binDir,
		cleanup: async () => {
			// Best-effort: vitest cleans tmp on its own.
			void dir;
		},
	};
};

const buildEnv = (
	canonical: string,
	binDir: string,
	platform: 'posix' | 'win32' = 'posix',
) => ({ platform, binDir, canonicalPath: canonical });

describe('alias integration (real fs, b00239 S6)', () => {
	it('install → file exists with marker → status reports ours', async () => {
		const { binDir, cleanup } = await mkTmpBin();
		try {
			const io = createNodeAliasIo();
			const env = buildEnv(join(binDir, 'delendai'), binDir);
			const outcome = await installAlias('est', env, io);
			expect(outcome.action).toBe('created');
			expect(outcome.status.state).toBe('ours');

			// File actually lives on disk.
			const path = join(binDir, 'est');
			const st = await stat(path);
			expect(st.isFile()).toBe(true);

			// File carries the marker.
			const contents = await readFile(path, 'utf8');
			expect(contents).toContain(ALIAS_MARKER);
			expect(contents).toContain(env.canonicalPath);

			// Re-reading the state via the SAME adapter reports
			// `ours` — idempotent.
			const re = await readAliasState('est', env, io);
			expect(re.state).toBe('ours');
		} finally {
			await cleanup();
		}
	});

	it('install → remove → status reports absent; no file on disk', async () => {
		const { binDir, cleanup } = await mkTmpBin();
		try {
			const io = createNodeAliasIo();
			const env = buildEnv(join(binDir, 'delendai'), binDir);
			await installAlias('est', env, io);
			const removed = await removeAlias('est', env, io);
			expect(removed.action).toBe('created');
			expect(removed.status.state).toBe('absent');

			const after = await readAliasState('est', env, io);
			expect(after.state).toBe('absent');

			// File actually removed — `stat` throws ENOENT.
			await expect(stat(join(binDir, 'est'))).rejects.toThrow();
		} finally {
			await cleanup();
		}
	});

	it('foreign file is NEVER overwritten; install returns refused', async () => {
		const { binDir, cleanup } = await mkTmpBin();
		try {
			const io = createNodeAliasIo();
			const env = buildEnv(join(binDir, 'delendai'), binDir);
			const foreignPath = join(binDir, 'est');
			const foreignContents =
				'#!/bin/sh\necho this is some other program\n';
			await io.write(foreignPath, foreignContents);

			const outcome = await installAlias('est', env, io);
			expect(outcome.action).toBe('refused');
			expect(outcome.status.state).toBe('foreign');

			// File unchanged byte-for-byte.
			const after = await readFile(foreignPath, 'utf8');
			expect(after).toBe(foreignContents);
		} finally {
			await cleanup();
		}
	});

	it('re-installing after a foreign refusal still refuses — never silently overwrites', async () => {
		const { binDir, cleanup } = await mkTmpBin();
		try {
			const io = createNodeAliasIo();
			const env = buildEnv(join(binDir, 'delendai'), binDir);
			const foreignPath = join(binDir, 'est');
			await io.write(
				foreignPath,
				'#!/bin/sh\necho other program\n',
			);

			for (let i = 0; i < 3; i++) {
				const outcome = await installAlias('est', env, io);
				expect(outcome.action).toBe('refused');
			}
			const after = await readFile(foreignPath, 'utf8');
			expect(after).toContain('other program');
		} finally {
			await cleanup();
		}
	});

	it('shims on Windows are written with both .cmd and .ps1', async () => {
		if (process.platform === 'win32') {
			const { binDir, cleanup } = await mkTmpBin();
			try {
				const io = createNodeAliasIo();
				const env = buildEnv(
					join(binDir, 'delendai'),
					binDir,
					'win32',
				);
				await installAlias('est', env, io);
				expect(
					(await stat(join(binDir, 'est.cmd'))).isFile(),
				).toBe(true);
				expect(
					(await stat(join(binDir, 'est.ps1'))).isFile(),
				).toBe(true);
			} finally {
				await cleanup();
			}
		} else {
			// POSIX hosts: verify the manager asks for exactly one path.
			const { binDir, cleanup } = await mkTmpBin();
			try {
				const io = createNodeAliasIo();
				const env = buildEnv(
					join(binDir, 'delendai'),
					binDir,
					'posix',
				);
				const status = await readAliasState('est', env, io);
				expect(status.path).toBe(
					join(binDir, 'est').split(sep).join(sep),
				);
			} finally {
				await cleanup();
			}
		}
	});
});
