/**
 * env-check-containment.spec.ts — the `env_check` tool refuses a `.env`
 * whose real location is outside the workspace.
 *
 * The adapter beneath the tool has its own containment spec; this covers
 * the tool boundary, which resolves `args.path` itself when no deps
 * override is supplied. It used the lexical primitive — a string
 * comparison that cannot see `workspace/linked/.env` pointing at another
 * tree's secrets.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../../tools/scripts/lib/test-mcp-server';
import { buildEnvCheckRegistration } from '../../../../src/lib/tools/env-check.tool';

describe('env_check path containment', () => {
	let parent = '';
	let workspaceRootAbs = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'env-check-containment-'));
		workspaceRootAbs = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(workspaceRootAbs, { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(workspaceRootAbs, '.env'), 'INSIDE=yes\n', 'utf8');
		await writeFile(join(outside, '.env'), 'SECRET=stolen\n', 'utf8');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('reads a .env that really is inside the workspace', async () => {
		const captured = await captureToolRegistration(
			buildEnvCheckRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs,
			}),
		);

		const out = (await captured.invoke({})) as { found: boolean };

		expect(out.found).toBe(true);
	});

	it('refuses a .env reached through a symlink that leaves the workspace', async () => {
		await symlink(outside, join(workspaceRootAbs, 'linked'), 'dir');
		const captured = await captureToolRegistration(
			buildEnvCheckRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs,
			}),
		);

		const out = await captured.invoke({ path: 'linked/.env' });

		// Refused, and the outside secret never reaches the caller.
		expect(JSON.stringify(out)).not.toContain('SECRET');
	});
});
