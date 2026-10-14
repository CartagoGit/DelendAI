/**
 * stray-member-cache.migrator.spec.ts — the caches a server wrote inside a
 * workspace member go, when everything in them regenerates.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStrayMemberCacheMigrator } from '../../../../../src/lib/workspace-migration/migrators/stray-member-cache.migrator';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'stray-cache-'));
	roots.push(root);
	writeFileSync(join(root, 'delendai.config.json'), '{}');
	return root;
};

const cacheIn = (root: string, member: string, entries: readonly string[]) => {
	const dir = join(root, member, '.cache', 'delendai');
	for (const entry of entries)
		mkdirSync(join(dir, entry), { recursive: true });
	return dir;
};

describe('the stray member cache migrator', () => {
	it('removes a regenerable cache from a member, and its empty .cache', async () => {
		const root = workspace();
		const dir = cacheIn(root, 'packages/core', ['runtime', 'evidence']);
		const migrator = createStrayMemberCacheMigrator();
		const ctx = { workspaceRoot: root, dryRun: false };

		expect(await migrator.detect(ctx)).toBe(true);
		expect(await migrator.plan(ctx)).toEqual([
			expect.objectContaining({ kind: 'remove' }),
		]);
		await migrator.apply(ctx);

		expect(existsSync(dir)).toBe(false);
		expect(existsSync(join(root, 'packages/core/.cache'))).toBe(false);
		expect(await migrator.detect(ctx)).toBe(false);
	});

	it('leaves a cache holding records, and a member that is a project', async () => {
		const root = workspace();
		const records = cacheIn(root, 'packages/a', ['runtime', 'state']);
		const project = cacheIn(root, 'examples/b', ['runtime']);
		writeFileSync(join(root, 'examples/b/delendai.config.json'), '{}');
		const migrator = createStrayMemberCacheMigrator();
		const ctx = { workspaceRoot: root, dryRun: false };

		expect(await migrator.plan(ctx)).toEqual([
			expect.objectContaining({ kind: 'conflict' }),
		]);
		await migrator.apply(ctx);

		expect(existsSync(records)).toBe(true);
		expect(existsSync(project)).toBe(true);
	});

	it('changes nothing in a rehearsal, and ignores the workspace own cache', async () => {
		const root = workspace();
		mkdirSync(join(root, '.cache', 'delendai', 'runtime'), {
			recursive: true,
		});
		const dir = cacheIn(root, 'plugins/x', ['runtime']);
		const migrator = createStrayMemberCacheMigrator();

		await migrator.apply({ workspaceRoot: root, dryRun: true });
		expect(existsSync(dir)).toBe(true);
		expect(existsSync(join(root, '.cache', 'delendai'))).toBe(true);
	});

	it('treats a stray cache that is a file, not a directory, as empty and removes it', async () => {
		const root = workspace();
		mkdirSync(join(root, 'packages/c/.cache'), { recursive: true });
		const stray = join(root, 'packages/c/.cache/delendai');
		writeFileSync(stray, 'not a directory');
		const migrator = createStrayMemberCacheMigrator();
		await migrator.apply({ workspaceRoot: root, dryRun: false });
		expect(existsSync(stray)).toBe(false);
	});
});
