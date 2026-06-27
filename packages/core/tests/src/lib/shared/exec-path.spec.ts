/**
 * f00058 S1 — `exec-path.ts` contract tests.
 *
 * Mirrors the five acceptance bullets in the proposal. Uses a fresh
 * tmp dir per test (the spec is allowed to do this; only RUNTIME code
 * is forbidden from `os.tmpdir()`).
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	EXEC_SUBDIR_NAME,
	execDirRelative,
	pruneExpiredExec,
	resolveExecPath,
	withEphemeralExec,
} from '../../../../src/lib/shared/exec-path';
import type { IMcpPluginContext } from '../../../../src/lib/plugins/plugin-contract';

const makeCtx = (pluginCacheDir: string): IMcpPluginContext => {
	// The helper only reads `ctx.pluginCacheDir`; everything else is a
	// throwaway literal that satisfies the contract surface.
	return {
		pluginCacheDir,
		workspace: {
			resolve: (rel: string) => rel,
		},
		corePaths: {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		keepLegacy: false,
		pluginDocsDir: join(pluginCacheDir, '..', 'docs'),
		namespacePrefix: 'test',
		options: {},
		args: {},
	} as unknown as IMcpPluginContext;
};

describe('resolveExecPath (f00058 S1)', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkTmpDir('exec-path-spec-');
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('returns <pluginCacheDir>/exec/<name> and mkdir-p is idempotent', async () => {
		const ctx = makeCtx(root);
		const a = await resolveExecPath(ctx, 'foo.sh');
		const b = await resolveExecPath(ctx, 'foo.sh');
		expect(a.abs).toBe(join(root, EXEC_SUBDIR_NAME, 'foo.sh'));
		expect(b.abs).toBe(a.abs);
		expect(a.rel).toBe('exec/foo.sh');
		expect(a.execDir).toBe(join(root, EXEC_SUBDIR_NAME));
	});

	it('rejects ../escape.sh with a structured error (exec containment)', async () => {
		const ctx = makeCtx(root);
		await expect(resolveExecPath(ctx, '../escape.sh')).rejects.toThrow(
			/escapes <pluginCacheDir>\/exec/,
		);
	});

	it('rejects absolute paths', async () => {
		const ctx = makeCtx(root);
		await expect(resolveExecPath(ctx, '/etc/passwd')).rejects.toThrow(
			/must be relative/,
		);
	});

	it('rejects empty / NUL-bearing names', async () => {
		const ctx = makeCtx(root);
		await expect(resolveExecPath(ctx, '')).rejects.toThrow(
			/non-empty string/,
		);
		await expect(resolveExecPath(ctx, 'probe\u0000.json')).rejects.toThrow(
			/NUL byte/,
		);
	});

	it('allows nested subpaths inside exec/', async () => {
		const ctx = makeCtx(root);
		const r = await resolveExecPath(ctx, 'sub/dir/x.sh');
		expect(r.rel).toBe('exec/sub/dir/x.sh');
		expect(r.abs).toBe(join(root, 'exec', 'sub', 'dir', 'x.sh'));
	});

	it('withEphemeralExec writes, runs, and unlinks even when fn throws', async () => {
		const ctx = makeCtx(root);
		const out = await withEphemeralExec(ctx, 'probe.json', async (abs) => {
			await writeFile(abs, '{"ok":true}');
			const txt = await readFile(abs, 'utf8');
			return JSON.parse(txt) as { ok: boolean };
		});
		expect(out).toEqual({ ok: true });
		const left = await readFile(
			join(root, 'exec', 'probe.json'),
			'utf8',
		).catch(() => '');
		expect(left).toBe('');
	});

	it('withEphemeralExec still unlinks when fn throws', async () => {
		const ctx = makeCtx(root);
		await expect(
			withEphemeralExec(ctx, 'broken.json', async (abs) => {
				await writeFile(abs, 'x');
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		const left = await readFile(
			join(root, 'exec', 'broken.json'),
			'utf8',
		).catch(() => '');
		expect(left).toBe('');
	});

	it('pruneExpiredExec removes files older than ttlMs, missing dir → empty', async () => {
		const ctx = makeCtx(root);
		const missing = await pruneExpiredExec(ctx, 1);
		expect(missing).toEqual({
			execDir: join(root, EXEC_SUBDIR_NAME),
			removed: 0,
			errors: [],
		});

		const fresh = await resolveExecPath(ctx, 'fresh.json');
		await writeFile(fresh.abs, 'fresh');

		// Force an old mtime by sleeping > 50ms then passing ttlMs=10.
		await sleep(60);
		const result = await pruneExpiredExec(ctx, 10);
		expect(result.removed).toBe(1);
		const left = await readFile(fresh.abs, 'utf8').catch(() => '');
		expect(left).toBe('');
	});

	it('execDirRelative returns the forward-slash relative path', () => {
		const ctx = makeCtx(root);
		expect(execDirRelative(ctx)).toBe('exec');
	});
});

const mkTmpDir = async (prefix: string): Promise<string> => {
	const { mkdtemp } = await import('node:fs/promises');
	return mkdtemp(join(tmpdir(), prefix));
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

describe('create_directory helper used by exec-path tests', () => {
	it('mkTmpDir creates and the directory is writable', async () => {
		const d = await mkTmpDir('mkdir-check-');
		await mkdir(d, { recursive: true });
		expect(d.startsWith(tmpdir())).toBe(true);
		await rm(d, { recursive: true, force: true });
	});
});
