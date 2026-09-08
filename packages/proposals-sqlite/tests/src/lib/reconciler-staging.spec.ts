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

	const PLAN_MARKDOWN = `---
id: q00042
title: Fixture plan
kind: plan
status: done
type: proposal
track: architecture
---
# Fixture plan

## Slices

### S1 — First slice
- **Status**: done
- **Gate**: type

### S2 — Second slice
- **Status**: pending
- **Gate**: type
`;

	it('stages proposals, plans and slices with 0008 closed_at parity (x00528 S2)', () => {
		const result = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'x00528',
			sha: 'tree-x00528',
			files: [
				{
					path: 'ready/plans/q00042.md',
					sha: 'blob-q00042',
					raw: PLAN_MARKDOWN,
				},
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: Flat\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Flat`,
				},
			],
			now: Date.parse('2026-09-08T12:00:00.000Z'),
		});

		expect(result.status).toBe('ok');
		expect(result.integrity.status).toBe('ok');
		expect(result.foreignKey.status).toBe('ok');
		expect(result.proposalsStaged).toBe(2);
		expect(result.plansStaged).toBe(1);
		expect(result.slicesStaged).toBe(2);

		const staged = new ProposalsSqliteDriver({
			path: result.stagingPath,
			readonly: true,
		});
		try {
			const plan = staged.handle
				.query<
					{
						readonly uid: string;
						readonly status: string;
						readonly closed_at: number | null;
						readonly source_path: string | null;
						readonly proposal_uid: string;
					},
					[]
				>(
					`SELECT plans.uid AS uid, plans.status AS status,
							plans.closed_at AS closed_at,
							plans.source_path AS source_path,
							proposals.uid AS proposal_uid
					 FROM plans JOIN proposals ON proposals.id = plans.proposal_id`
				)
				.get();
			expect(plan?.uid).toBe('q00042');
			expect(plan?.proposal_uid).toBe('q00042');
			expect(plan?.status).toBe('done');
			// 0008 parity: a closed plan must carry a closed_at.
			expect(plan?.closed_at).not.toBeNull();
			expect(plan?.source_path).toBe('ready/plans/q00042.md');

			const slices = staged.handle
				.query<
					{
						readonly uid: string;
						readonly status: string;
						readonly closed_at: number | null;
						readonly plan_uid: string;
					},
					[]
				>(
					`SELECT slices.uid AS uid, slices.status AS status,
							slices.closed_at AS closed_at, plans.uid AS plan_uid
					 FROM slices JOIN plans ON plans.id = slices.plan_id
					 ORDER BY slices.uid`
				)
				.all();
			expect(slices.map((slice) => slice.uid)).toEqual([
				'q00042.S1',
				'q00042.S2',
			]);
			expect(slices.every((slice) => slice.plan_uid === 'q00042')).toBe(
				true
			);
			expect(slices[0]?.status).toBe('done');
			expect(slices[0]?.closed_at).not.toBeNull();
			expect(slices[1]?.status).toBe('ready');
			expect(slices[1]?.closed_at).toBeNull();
		} finally {
			staged.close();
		}
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
					 LIMIT 1`
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
					 LIMIT 1`
				)
				.get();
			expect(row?.status).toBe('failed');
			expect(row?.error).toContain('foreign_key_check failed');
		} finally {
			forensic.close();
		}
	});
});
