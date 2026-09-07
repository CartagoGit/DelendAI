import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyMigrations,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
} from '../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-shadow-'));

describe('reconcileShadowToStaging (q00024 S1)', () => {
	let rootDir: string;
	let workspacePath: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		workspacePath = join(rootDir, 'workspace');
		statePath = join(rootDir, '.delendai', 'state');
		activePath = join(statePath, 'proposals.sqlite');
		mkdirSync(statePath, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('writes only the staging DB and keeps the active DB mtime unchanged', () => {
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.close();
		const before = statSync(activePath).mtimeMs;

		const result = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'abc1234',
			sha: 'tree-abc1234',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: One\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# One`,
				},
			],
			now: Date.parse('2026-09-07T12:00:00.000Z'),
		});

		expect(result.status).toBe('ok');
		expect(result.integrity.status).toBe('ok');
		expect(result.foreignKey.status).toBe('ok');
		expect(result.failedStagingPath).toBeNull();
		expect(existsSync(result.stagingPath)).toBe(true);
		expect(statSync(activePath).mtimeMs).toBe(before);
	});

	it('preserves a failed staging DB for forensics and does not touch the active DB', () => {
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.close();
		const before = statSync(activePath).mtimeMs;

		const result = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'def5678',
			sha: 'tree-def5678',
			files: [
				{
					path: 'ready/fixes/x00002.md',
					sha: 'blob-x00002',
					raw: `---\nid: x00002\ntitle: Missing kind\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Missing kind`,
				},
			],
			now: Date.parse('2026-09-07T12:01:00.000Z'),
		});

		expect(result.status).toBe('failed');
		expect(result.error).toContain('missing kind or status');
		expect(result.failedStagingPath).not.toBeNull();
		if (result.failedStagingPath === null) return;
		expect(existsSync(result.failedStagingPath)).toBe(true);
		expect(existsSync(result.stagingPath)).toBe(false);
		expect(statSync(activePath).mtimeMs).toBe(before);

		const forensic = new ProposalsSqliteDriver({
			path: result.failedStagingPath,
			readonly: true,
		});
		try {
			const row = forensic.handle
				.query<
					{ readonly status: string; readonly error: string | null },
					[]
				>(
					`SELECT status, error
					 FROM reconciliation_runs
					 ORDER BY id DESC
					 LIMIT 1`,
				)
				.get();
			expect(row?.status).toBe('failed');
			expect(row?.error).toContain('missing kind or status');
		} finally {
			forensic.close();
		}
	});

	it('preserves failed staging when foreign_key_check fails and keeps the active DB untouched', () => {
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.close();
		const before = statSync(activePath).mtimeMs;

		const result = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'ghi9012',
			sha: 'tree-ghi9012',
			files: [
				{
					path: 'ready/fixes/x00003.md',
					sha: 'blob-x00003',
					raw: `---\nid: x00003\ntitle: Three\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Three`,
				},
			],
			now: Date.parse('2026-09-07T12:02:00.000Z'),
			driver: {
				apply: (db) => {
					const applied = applyMigrations(db);
					db.exec(`
						PRAGMA foreign_keys = OFF;
						CREATE TABLE staging_parent (
							id INTEGER PRIMARY KEY
						);
						CREATE TABLE staging_child (
							id INTEGER PRIMARY KEY,
							parent_id INTEGER NOT NULL REFERENCES staging_parent(id)
						);
						INSERT INTO staging_child (id, parent_id) VALUES (1, 999);
						PRAGMA foreign_keys = ON;
					`);
					return applied;
				},
			},
		});

		expect(result.status).toBe('failed');
		expect(result.integrity.status).toBe('ok');
		expect(result.foreignKey.status).toBe('failed');
		expect(result.error).toContain('foreign_key_check failed');
		expect(result.failedStagingPath).not.toBeNull();
		expect(result.foreignKey.violations).toEqual([
			{
				table: 'staging_child',
				rowId: 1,
				parent: 'staging_parent',
				foreignKeyIndex: 0,
			},
		]);
		if (result.failedStagingPath === null) return;
		expect(existsSync(result.failedStagingPath)).toBe(true);
		expect(existsSync(result.stagingPath)).toBe(false);
		expect(statSync(activePath).mtimeMs).toBe(before);

		const forensic = new ProposalsSqliteDriver({
			path: result.failedStagingPath,
			readonly: true,
		});
		try {
			const row = forensic.handle
				.query<
					{ readonly status: string; readonly error: string | null },
					[]
				>(
					`SELECT status, error
					 FROM reconciliation_runs
					 ORDER BY id DESC
					 LIMIT 1`,
				)
				.get();
			expect(row?.status).toBe('failed');
			expect(row?.error).toContain('foreign_key_check failed');
		} finally {
			forensic.close();
		}
	});
});
