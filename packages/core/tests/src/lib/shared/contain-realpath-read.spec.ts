/**
 * contain-realpath-read.spec.ts — q00016 S4.
 *
 * `resolveWorkspaceContained` is lexical: it never touches the filesystem,
 * so `workspace/foo -> /home/user/.ssh` followed by a read of `foo/config`
 * passes the lexical check (the STRING never leaves the workspace) even
 * though the FILE does. This spec proves the fix with a REAL symlink
 * created on disk — not a mocked filesystem — because a mock can't prove
 * containment: it can only prove the mock was configured the way the test
 * expected.
 *
 * Covers both the new primitive (`resolveExistingWorkspaceContained`) and
 * its wiring into the `fs_read` entry point (`fsRead`), plus the
 * over-rejection risk called out in q00016 S4's risk list: a symlink that
 * stays INSIDE the workspace (vendored code, a common real-world pattern)
 * must keep working.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fsRead } from '@mcp-vertex/core/lib/shared/fs-read';
import { resolveExistingWorkspaceContained } from '@mcp-vertex/core/lib/shared/contain-realpath';

describe('resolveExistingWorkspaceContained + fsRead — physical (realpath) containment on the read path', async () => {
	let workspace = '';
	let outside = '';
	beforeEach(() => {
		// realpath both roots so the assertions compare symlink-resolved
		// paths on either side (macOS /tmp is itself often a symlink).
		workspace = realpathSync(mkdtempSync(join(tmpdir(), 'read-sym-ws-')));
		outside = realpathSync(mkdtempSync(join(tmpdir(), 'read-sym-out-')));
	});
	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	});

	it('rejects a symlink INSIDE the workspace that points OUTSIDE it (real disk symlink)', async () => {
		const secret = join(outside, '.ssh-config');
		writeFileSync(secret, 'IdentityFile ~/.ssh/id_rsa_prod', 'utf8');
		// <workspace>/foo -> <outside>/.ssh-config, exactly the escape shape
		// named in q00016 ("workspace/foo -> /home/user/.ssh").
		symlinkSync(secret, join(workspace, 'foo'));

		const contained = await resolveExistingWorkspaceContained(
			workspace,
			'foo',
		);
		expect(contained.ok).toBe(false);
		// The rejection must name the path and the reason — not a mystery
		// "not found".
		expect(contained.reason).toBeDefined();
		expect(contained.reason).toMatch(/symlink|escapes/i);
		expect(contained.reason).toContain('foo');
	});

	it('fsRead refuses to read through that symlink, and the result names the path + reason', async () => {
		const secret = join(outside, 'id_rsa');
		writeFileSync(secret, 'PRIVATE KEY MATERIAL', 'utf8');
		symlinkSync(secret, join(workspace, 'foo'));

		const result = await fsRead(workspace, 'foo');

		expect(result.found).toBe(false);
		expect(result.content).toBeNull();
		expect(result.reason).toBeDefined();
		expect(result.reason).toMatch(/symlink|escapes/i);
		expect(result.reason).toContain('foo');
	});

	it('rejects a read through a symlinked DIRECTORY that escapes the workspace', async () => {
		writeFileSync(join(outside, 'config'), 'outside-secret', 'utf8');
		symlinkSync(outside, join(workspace, 'vendor')); // <ws>/vendor -> <outside>

		const result = await fsRead(workspace, 'vendor/config');
		expect(result.found).toBe(false);
		expect(result.reason).toBeDefined();
	});

	it('does NOT over-reject: a symlink that stays INSIDE the workspace still reads fine', async () => {
		// Real-world pattern the risk list calls out explicitly: a repo
		// vendoring code via an in-tree symlink.
		writeFileSync(
			join(workspace, 'real-lib.txt'),
			'vendored content',
			'utf8',
		);
		symlinkSync(
			join(workspace, 'real-lib.txt'),
			join(workspace, 'lib-alias.txt'),
		);

		const contained = await resolveExistingWorkspaceContained(
			workspace,
			'lib-alias.txt',
		);
		expect(contained.ok).toBe(true);

		const result = await fsRead(workspace, 'lib-alias.txt');
		expect(result.found).toBe(true);
		expect(result.content).toBe('vendored content');
		expect(result.reason).toBeUndefined();
	});

	it('does NOT over-reject: a symlinked directory that stays inside the workspace still reads fine', async () => {
		const { mkdirSync } = await import('node:fs');
		mkdirSync(join(workspace, 'real-dir'));
		writeFileSync(join(workspace, 'real-dir', 'marker.txt'), 'x', 'utf8');
		// <ws>/dir-alias -> <ws>/real-dir, both inside the workspace.
		symlinkSync(join(workspace, 'real-dir'), join(workspace, 'dir-alias'));

		const result = await fsRead(workspace, 'dir-alias/marker.txt');
		expect(result.found).toBe(true);
		expect(result.content).toBe('x');
	});

	it('honors authorizedRoots on the physical check the same way the lexical check does', async () => {
		writeFileSync(join(outside, 'shared.txt'), 'shared content', 'utf8');
		symlinkSync(outside, join(workspace, 'ext')); // <ws>/ext -> <outside>, authorized

		const contained = await resolveExistingWorkspaceContained(
			workspace,
			'ext/shared.txt',
			[outside],
		);
		expect(contained.ok).toBe(true);

		const result = await fsRead(workspace, 'ext/shared.txt', undefined, [
			outside,
		]);
		expect(result.found).toBe(true);
		expect(result.content).toBe('shared content');
	});

	it('a plain missing file still reports found:false with no containment reason (not a mystery escape)', async () => {
		const result = await fsRead(workspace, 'does-not-exist.txt');
		expect(result.found).toBe(false);
		expect(result.reason).toBeUndefined();
	});
});
