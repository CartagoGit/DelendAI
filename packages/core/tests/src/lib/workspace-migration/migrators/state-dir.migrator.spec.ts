/**
 * state-dir.migrator.spec.ts — the legacy state directory is moved where
 * the current product reads it, and nothing of it stays behind.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createStateDirMigrator } from '@delendai/core/lib/workspace-migration/migrators/state-dir.migrator';

let root: string;
const migrator = createStateDirMigrator();
const ctx = (dryRun = false) => ({ workspaceRoot: root, dryRun });
const legacy = () => join(root, '.delendai', 'state');
const current = () => join(root, '.cache', 'delendai', 'state');

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'state-dir-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const legacyDatabase = async (): Promise<void> => {
	await mkdir(legacy(), { recursive: true });
	await writeFile(join(legacy(), 'a.sqlite'), 'db');
	await writeFile(join(legacy(), 'a.sqlite-wal'), 'wal');
};

describe('the state directory migrator', () => {
	it('moves the legacy files with their sidecars, and removes the emptied directory', async () => {
		await legacyDatabase();
		expect(await migrator.detect(ctx())).toBe(true);
		expect(
			(await migrator.plan(ctx(true))).map((step) => step.kind),
		).toEqual(['move', 'move']);
		await migrator.apply(ctx(true));
		expect(existsSync(join(legacy(), 'a.sqlite'))).toBe(true);

		await migrator.apply(ctx());

		expect(await readFile(join(current(), 'a.sqlite'), 'utf8')).toBe('db');
		expect(await readFile(join(current(), 'a.sqlite-wal'), 'utf8')).toBe(
			'wal',
		);
		expect(existsSync(legacy())).toBe(false);
		expect(await migrator.detect(ctx())).toBe(false);
	});

	it('keeps a file already at the current place, and leaves the legacy one to compare', async () => {
		await legacyDatabase();
		await mkdir(current(), { recursive: true });
		await writeFile(join(current(), 'a.sqlite'), 'current');

		expect(
			(await migrator.plan(ctx(true))).map((step) => step.kind),
		).toEqual(['move', 'conflict']);
		await migrator.apply(ctx());

		expect(await readFile(join(current(), 'a.sqlite'), 'utf8')).toBe(
			'current',
		);
		expect(existsSync(join(legacy(), 'a.sqlite'))).toBe(true);
	});

	it('finds nothing to do in a project without the legacy directory', async () => {
		expect(await migrator.detect(ctx())).toBe(false);
	});
});
