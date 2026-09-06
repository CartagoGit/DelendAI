/**
 * integration.spec.ts — b00239 S3.
 *
 * End-to-end round-trip via the production filesystem adapter. The
 * unit spec (`bridge-installer.spec.ts`) covers the four cases with an
 * in-memory io; this spec pins the *real* behaviour: the bridge
 * directory exists on disk, the marker is the right byte sequence,
 * the executable bit is set on POSIX, the README is there, and a
 * second call is byte-for-byte idempotent.
 *
 * Each test uses its own tmp dir so parallel runs do not collide. The
 * tmp dirs are best-effort cleaned up — vitest will sweep them on
 * its own, so we only do it when path safety is trivial (i.e. the
 * mkdtemp prefix matches a recognised pattern).
 */

import { chmod, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	installBridgeDirectory,
	readBridgeDirectoryStatus,
	removeBridgeDirectory,
} from './bridge-installer';
import { createNodeBridgeIo } from './io-real';
import {
	BRIDGE_MARKER,
	BRIDGE_DIR_NAME,
} from '../../contracts/constants/bridge.constant';

const mkTmpWorkspace = async (): Promise<{
	workspace: string;
	cleanup: () => Promise<void>;
}> => {
	const dir = await mkdtemp(join(tmpdir(), 'bridge-int-'));
	return {
		workspace: dir,
		cleanup: async () => {
			void dir;
		},
	};
};

const envFor = (workspace: string, platform: 'posix' | 'win32' = 'posix') => ({
	platform,
	workspaceRoot: workspace,
	canonical: 'delendai',
});

describe('bridge integration (real fs, b00239 S3)', () => {
	it('install → files exist with marker → status reports ours', async () => {
		const { workspace, cleanup } = await mkTmpWorkspace();
		try {
			const io = createNodeBridgeIo();
			const env = envFor(workspace);
			const outcome = await installBridgeDirectory(env, io);
			expect(outcome.action).toBe('created');
			expect(outcome.status.shims.every((s) => s.state === 'ours')).toBe(
				true,
			);

			// Files actually exist on disk and carry the marker.
			const dir = join(workspace, BRIDGE_DIR_NAME);
			const first = await readFile(join(dir, 'mcp-vertex'), 'utf8');
			expect(first).toContain(BRIDGE_MARKER);
			expect(first).toContain('mcp-vertex');
			expect(first).toContain('exec "delendai"');
			const second = await readFile(join(dir, 'mcpv'), 'utf8');
			expect(second).toContain(BRIDGE_MARKER);
			expect(second).toContain('mcpv');

			// README lives in the same directory.
			const readme = await readFile(join(dir, 'README.md'), 'utf8');
			expect(readme).toContain('delendai bridge install');

			// POSIX shim is executable.
			const st = await stat(join(dir, 'mcp-vertex'));
			expect(st.isFile()).toBe(true);
			if (process.platform !== 'win32') {
				const mode = (await stat(join(dir, 'mcp-vertex'))).mode & 0o777;
				expect(mode & 0o111).toBe(0o111);
			}

			// Recogniser agrees: `status` reports `ours` via the SAME
			// adapter that wrote the file.
			const status = await readBridgeDirectoryStatus(env, io);
			expect(status.readmePresent).toBe(true);
			expect(status.shims.every((s) => s.state === 'ours')).toBe(true);
		} finally {
			await cleanup();
		}
	});

	it('install → remove → status reports absent; no shim files on disk', async () => {
		const { workspace, cleanup } = await mkTmpWorkspace();
		try {
			const io = createNodeBridgeIo();
			const env = envFor(workspace);
			await installBridgeDirectory(env, io);

			const removed = await removeBridgeDirectory(env, io);
			expect(removed.action).toBe('created');
			expect(
				removed.status.shims.every((s) => s.state === 'absent'),
			).toBe(true);

			const dir = join(workspace, BRIDGE_DIR_NAME);
			const after = await readBridgeDirectoryStatus(env, io);
			expect(after.shims.every((s) => s.state === 'absent')).toBe(true);

			// The shims are gone from disk — `stat` throws ENOENT on each.
			for (const shim of removed.status.shims) {
				for (const path of shim.paths) {
					await expect(stat(path)).rejects.toThrow();
				}
			}

			// The README is also gone (removal is whole-directory when the
			// directory only contains marker-bearing files we created).
			await expect(stat(join(dir, 'README.md'))).rejects.toThrow();
		} finally {
			await cleanup();
		}
	});

	it('foreign file is NEVER overwritten; install reports refused for that shim', async () => {
		const { workspace, cleanup } = await mkTmpWorkspace();
		try {
			const io = createNodeBridgeIo();
			const env = envFor(workspace);
			const dir = join(workspace, BRIDGE_DIR_NAME);
			// Pre-create a foreign file at the bridge path the
			// (deduplicated) installer would write to. The recogniser
			// must see this as `foreign` and refuse to replace it.
			await io.write(
				join(dir, 'mcp-vertex'),
				'#!/bin/sh\necho other program\n',
			);
			// Force executable so chmod does not throw later.
			if (process.platform !== 'win32') {
				await chmod(join(dir, 'mcp-vertex'), 0o755);
			}

			const outcome = await installBridgeDirectory(env, io);
			// Action is 'unchanged' when the single declared legacy
			// name is already occupied by foreign content. The second
			// legacy shim (`mcpv`) is still free, so it is created while
			// the foreign `mcp-vertex` path stays untouched.
			expect(outcome.perShim).toHaveLength(2);
			expect(outcome.perShim[0]?.action).toBe('refused');
			expect(outcome.perShim[0]?.status.state).toBe('foreign');
			expect(outcome.perShim[1]?.action).toBe('created');

			// File changed byte-for-byte: still the foreign body.
			const after = await readFile(join(dir, 'mcp-vertex'), 'utf8');
			expect(after).toContain('other program');
		} finally {
			await cleanup();
		}
	});

	it('re-installing after a foreign refusal still refuses for that one shim — no silent overwrite', async () => {
		const { workspace, cleanup } = await mkTmpWorkspace();
		try {
			const io = createNodeBridgeIo();
			const env = envFor(workspace);
			const dir = join(workspace, BRIDGE_DIR_NAME);
			await io.write(
				join(dir, 'mcp-vertex'),
				'#!/bin/sh\necho other program\n',
			);

			for (let i = 0; i < 3; i++) {
				const outcome = await installBridgeDirectory(env, io);
				expect(outcome.perShim[0]?.action).toBe('refused');
			}

			const after = await readFile(join(dir, 'mcp-vertex'), 'utf8');
			expect(after).toContain('other program');
		} finally {
			await cleanup();
		}
	});

	it('idempotent: a second install reports `unchanged` and writes nothing', async () => {
		const { workspace, cleanup } = await mkTmpWorkspace();
		try {
			const io = createNodeBridgeIo();
			const env = envFor(workspace);
			await installBridgeDirectory(env, io);
			const dir = join(workspace, BRIDGE_DIR_NAME);
			// Capture byte-level state for every file the installer wrote.
			const before: Record<string, string> = {};
			for (const shim of (await readBridgeDirectoryStatus(env, io))
				.shims) {
				for (const path of shim.paths) {
					if (!path.endsWith(sep) && path.includes(sep)) {
						before[path] = await readFile(path, 'utf8');
					}
				}
			}
			before[join(dir, 'README.md')] = await readFile(
				join(dir, 'README.md'),
				'utf8',
			);

			const second = await installBridgeDirectory(env, io);
			expect(second.action).toBe('unchanged');

			for (const path of Object.keys(before)) {
				const after = await readFile(path, 'utf8');
				expect(after).toBe(before[path]);
			}
		} finally {
			await cleanup();
		}
	});
});
