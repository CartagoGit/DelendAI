/**
 * contain-realpath-sync.spec.ts — the synchronous physical primitive.
 *
 * A plugin's `register(ctx)` is synchronous and resolves configured paths
 * that may not exist yet, so neither async primitive serves it. Every case
 * uses a REAL symlink on disk: a mocked filesystem can only prove the mock.
 */
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realpathContained } from '@delendai/core/lib/shared/contain-realpath';
import {
	realpathContainedSync,
	resolveWorkspaceContainedPhysicalSync,
} from '@delendai/core/lib/shared/contain-realpath-boot';

describe('resolveWorkspaceContainedPhysicalSync', () => {
	let workspace = '';
	let outside = '';
	beforeEach(() => {
		workspace = realpathSync(mkdtempSync(join(tmpdir(), 'sync-ws-')));
		outside = realpathSync(mkdtempSync(join(tmpdir(), 'sync-out-')));
	});
	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	});

	it('refuses a not-yet-existing path under a symlink that leaves the workspace', () => {
		symlinkSync(outside, join(workspace, 'link'), 'dir');
		const out = resolveWorkspaceContainedPhysicalSync(
			workspace,
			'link/records/new.json',
		);
		expect(out.ok).toBe(false);
		expect(out.reason).toBe(
			'path escapes workspace via symlink: link/records/new.json',
		);
	});

	it('accepts a path that does not exist yet inside the workspace', () => {
		const out = resolveWorkspaceContainedPhysicalSync(
			workspace,
			'.cache/delendai/records',
		);
		expect(out).toMatchObject({
			ok: true,
			rel: '.cache/delendai/records',
			abs: join(workspace, '.cache/delendai/records'),
		});
	});

	it('accepts a symlink that stays inside the workspace', () => {
		mkdirSync(join(workspace, 'vendor'));
		symlinkSync(join(workspace, 'vendor'), join(workspace, 'alias'), 'dir');
		expect(
			resolveWorkspaceContainedPhysicalSync(workspace, 'alias/x.json').ok,
		).toBe(true);
	});

	it('keeps the lexical refusal and its reason for `..` and absolute paths', () => {
		expect(
			resolveWorkspaceContainedPhysicalSync(workspace, '../x').ok,
		).toBe(false);
		expect(
			resolveWorkspaceContainedPhysicalSync(workspace, join(outside, 'x'))
				.reason,
		).toMatch(/absolute path not allowed/);
	});

	it('honours an authorized root reached through its real path', () => {
		symlinkSync(outside, join(workspace, 'shared'), 'dir');
		expect(
			resolveWorkspaceContainedPhysicalSync(workspace, 'shared/a.json', [
				outside,
			]).ok,
		).toBe(true);
	});
});

describe('real-root comparison', () => {
	let workspace = '';
	beforeEach(() => {
		workspace = realpathSync(mkdtempSync(join(tmpdir(), 'dotdot-ws-')));
	});
	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	it('treats a directory named `..cache` as inside, sync and async alike', async () => {
		const target = join(workspace, '..cache', 'x');
		expect(realpathContainedSync(target, [workspace])).toBe(true);
		expect(await realpathContained(target, [workspace])).toBe(true);
	});
});
