/**
 * migrate.spec.ts (M14) — versioned-state migration safety net.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MigrationError, runMigrations } from '@mcp-vertex/core/lib/migrations/migrate';
import type { IMigrator } from '@mcp-vertex/core/lib/migrations/migrate';
import { migrateJsonFile } from '@mcp-vertex/core/lib/migrations/migrate-file';

// v1 → v2 renames `name` → `title`; v2 → v3 adds `tags: []`.
const migrators: Record<number, IMigrator> = {
	1: (d) => ({ title: d.name, items: d.items }),
	2: (d) => ({ ...d, tags: [] }),
};

describe('runMigrations (M14)', () => {
	it('applies the chain in order and stamps the version', () => {
		const r = runMigrations({ version: 1, name: 'x', items: [1] }, migrators, 3);
		expect(r.applied).toEqual([1, 2]);
		expect(r.to).toBe(3);
		expect(r.data).toEqual({ version: 3, title: 'x', items: [1], tags: [] });
	});

	it('is a no-op when already at the target', () => {
		const r = runMigrations({ version: 3, title: 'x' }, migrators, 3);
		expect(r.applied).toEqual([]);
		expect(r.data).toEqual({ version: 3, title: 'x' });
	});

	it('refuses a downgrade', () => {
		expect(() => runMigrations({ version: 5 }, migrators, 3)).toThrow(MigrationError);
	});

	it('throws on an incomplete migrator chain', () => {
		expect(() => runMigrations({ version: 1 }, { 1: (d) => d }, 3)).toThrow(
			/no migrator from version 2/
		);
	});

	it('rejects an invalid version', () => {
		expect(() => runMigrations({ version: 0 }, migrators, 3)).toThrow(MigrationError);
	});
});

describe('migrateJsonFile (M14)', () => {
	let dir = '';
	let path = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'migrate-'));
		path = join(dir, 'store.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('migrates, backs up the original, and writes the new shape', async () => {
		writeFileSync(path, JSON.stringify({ version: 1, name: 'hi', items: [] }));
		const res = await migrateJsonFile(path, { migrators, targetVersion: 3 });
		expect(res?.changed).toBe(true);
		expect(res?.backupPath).toBeTruthy();
		expect(existsSync(res?.backupPath ?? '')).toBe(true);
		const onDisk = JSON.parse(readFileSync(path, 'utf8'));
		expect(onDisk).toEqual({ version: 3, title: 'hi', items: [], tags: [] });
		// backup preserves the original bytes
		expect(JSON.parse(readFileSync(res?.backupPath ?? '', 'utf8')).version).toBe(1);
	});

	it('dry-run reports the plan without writing or backing up', async () => {
		writeFileSync(path, JSON.stringify({ version: 1, name: 'hi', items: [] }));
		const res = await migrateJsonFile(path, { migrators, targetVersion: 3, dryRun: true });
		expect(res?.changed).toBe(true);
		expect(res?.backupPath).toBeNull();
		// file untouched
		expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(1);
	});

	it('returns null for a missing file', async () => {
		expect(await migrateJsonFile(path, { migrators, targetVersion: 3 })).toBeNull();
	});

	it('does not back up when already current', async () => {
		writeFileSync(path, JSON.stringify({ version: 3, title: 'hi' }));
		const res = await migrateJsonFile(path, { migrators, targetVersion: 3 });
		expect(res?.changed).toBe(false);
		expect(res?.backupPath).toBeNull();
	});
});
