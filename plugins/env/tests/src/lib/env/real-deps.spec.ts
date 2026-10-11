/**
 * real-deps.spec.ts — the env adapter reads a `.env` inside the
 * workspace, and refuses one that is only nominally inside it.
 *
 * The lexical containment check this adapter used never touched the
 * filesystem, so `workspace/linked/.env` passed it while `linked`
 * pointed somewhere else entirely — the exact shape of a credentials
 * leak, since a `.env` is the file most worth stealing. Physical
 * containment resolves the real path before the read.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realEnvDeps } from '../../../../src/lib/env/real-deps';

describe('realEnvDeps workspace containment', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'env-real-deps-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(workspace, { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(workspace, '.env'), 'INSIDE=yes\n', 'utf8');
		await writeFile(join(outside, '.env'), 'SECRET=stolen\n', 'utf8');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('reads a .env that really is inside the workspace', async () => {
		const deps = realEnvDeps(workspace);

		expect(await deps.readEnv('.env')).toContain('INSIDE=yes');
	});

	it('refuses a path that traverses out of the workspace', async () => {
		const deps = realEnvDeps(workspace);

		expect(await deps.readEnv('../outside/.env')).toBeUndefined();
	});

	it('refuses an absolute path outside the workspace', async () => {
		const deps = realEnvDeps(workspace);

		expect(await deps.readEnv(join(outside, '.env'))).toBeUndefined();
	});

	it('refuses a .env reached through a symlink that leaves the workspace', async () => {
		// The string `linked/.env` never leaves the workspace, which is
		// why the lexical check accepted it.
		await symlink(outside, join(workspace, 'linked'), 'dir');

		const deps = realEnvDeps(workspace);

		expect(await deps.readEnv('linked/.env')).toBeUndefined();
	});
});
