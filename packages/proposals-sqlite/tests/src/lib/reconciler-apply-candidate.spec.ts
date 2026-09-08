import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
} from '../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-promote-'));

describe('applyValidatedCandidate (q00024 S2)', () => {
	let rootDir: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		statePath = join(rootDir, '.delendai', 'state');
		activePath = join(statePath, 'proposals.sqlite');
		mkdirSync(statePath, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('applies the staging projection and preserves operational ledgers', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'abc1234',
			sha: 'tree-abc1234',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: Staged title\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Staged title`,
				},
			],
			now: 1000,
		});
		expect(staging.status).toBe('ok');

		const active = new ProposalsSqliteDriver({ path: activePath });
		active.handle.exec(`
			INSERT INTO proposals (
				uid, slug, kind, status, title, source_path, source_blob_sha,
				revision, content_hash, created_at, updated_at, closed_at
			) VALUES ('x00001', 'old-title', 'fix', 'ready', 'Old title',
				'old.md', 'old-blob', 3, 'old-hash', 900, 900, NULL);
			INSERT INTO lifecycle_events (
				entity_type, entity_uid, entity_revision, from_status, to_status,
				actor, source, occurred_at, metadata
			) VALUES ('proposal', 'x00001', 3, 'draft', 'ready', 'test', 'test', 901, NULL);
			INSERT INTO outbox (
				idempotency_key, kind, payload, next_attempt_at, created_at, updated_at
			) VALUES ('keep-outbox', 'test', '{}', 902, 902, 902);
			INSERT INTO mutation_commands (
				command_name, idempotency_key, request_fingerprint, entity_type,
				entity_uid, status, created_at
			) VALUES ('close', 'keep-command', 'fingerprint', 'proposal', 'x00001', 'started', 903);
		`);
		active.close();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'abc1234',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('ok');
		expect(result.proposalsApplied).toBe(1);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			const proposal = verified.handle
				.query<
					{ readonly title: string; readonly revision: number },
					[string]
				>('SELECT title, revision FROM proposals WHERE uid = ?')
				.get('x00001');
			expect(proposal).toEqual({ title: 'Staged title', revision: 4 });
			expect(
				verified.handle.query('SELECT id FROM lifecycle_events').all()
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM outbox').all()
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM mutation_commands').all()
			).toHaveLength(1);
			expect(
				verified.handle
					.query<
						{ readonly kind: string },
						[]
					>(`SELECT kind FROM reconciliation_runs ORDER BY id DESC LIMIT 1`)
					.get()?.kind
			).toBe('promote');
		} finally {
			verified.close();
		}
	});

	const PLAN_MARKDOWN = (id: string, status: string): string => `---
id: ${id}
title: Plan ${id}
kind: plan
status: ${status}
type: proposal
track: architecture
---
# Plan ${id}

## Slices

### S1 — First slice
- **Status**: done
- **Gate**: type

### S2 — Second slice
- **Status**: pending
- **Gate**: type
`;

	const stageTwoPlans = (now: number) =>
		reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'x00528',
			sha: 'tree-x00528',
			files: [
				{
					path: 'ready/plans/q00001.md',
					sha: 'blob-q00001',
					raw: PLAN_MARKDOWN('q00001', 'done'),
				},
				{
					path: 'ready/plans/q00002.md',
					sha: 'blob-q00002',
					raw: PLAN_MARKDOWN('q00002', 'ready'),
				},
			],
			now,
		});

	interface ISnapshotRow {
		readonly [key: string]: unknown;
	}

	const snapshot = (path: string): Record<string, readonly ISnapshotRow[]> => {
		const driver = new ProposalsSqliteDriver({ path, readonly: true });
		try {
			const tables = [
				'proposals',
				'plans',
				'slices',
				'lifecycle_events',
				'outbox',
				'mutation_commands',
				'quarantine',
				'reconciliation_runs',
			];
			const out: Record<string, readonly ISnapshotRow[]> = {};
			for (const table of tables) {
				out[table] = driver.handle
					.query<ISnapshotRow, []>(
						`SELECT * FROM ${table} ORDER BY rowid`
					)
					.all();
			}
			return out;
		} finally {
			driver.close();
		}
	};

	it('applies proposals, plans and slices in one transaction (x00528 S2)', () => {
		const staging = stageTwoPlans(1000);
		expect(staging.status).toBe('ok');

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'x00528',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('ok');
		expect(result.proposalsApplied).toBe(2);
		expect(result.plansApplied).toBe(2);
		expect(result.slicesApplied).toBe(4);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			expect(
				verified.handle
					.query<
						{ readonly uid: string },
						[]
					>('SELECT uid FROM plans ORDER BY uid')
					.all()
			).toEqual([{ uid: 'q00001' }, { uid: 'q00002' }]);
			expect(
				verified.handle
					.query<
						{ readonly uid: string },
						[]
					>('SELECT uid FROM slices ORDER BY uid')
					.all()
			).toEqual([
				{ uid: 'q00001.S1' },
				{ uid: 'q00001.S2' },
				{ uid: 'q00002.S1' },
				{ uid: 'q00002.S2' },
			]);
			// The plan/slice FKs were re-resolved on the active side.
			expect(
				verified.handle
					.query<
						{ readonly total: number },
						[]
					>(`SELECT COUNT(*) AS total FROM slices
					   JOIN plans ON plans.id = slices.plan_id
					   JOIN proposals ON proposals.id = plans.proposal_id`)
					.get()?.total
			).toBe(4);
			// 0008 parity survived the promotion.
			expect(
				verified.handle
					.query<
						{ readonly closed_at: number | null },
						[string]
					>('SELECT closed_at FROM plans WHERE uid = ?')
					.get('q00001')?.closed_at
			).not.toBeNull();
			expect(
				verified.handle
					.query<
						{ readonly closed_at: number | null },
						[string]
					>('SELECT closed_at FROM plans WHERE uid = ?')
					.get('q00002')?.closed_at
			).toBeNull();
			expect(
				verified.handle
					.query<{ readonly integrity_check: string }, []>(
						'PRAGMA integrity_check;'
					)
					.all()
			).toEqual([{ integrity_check: 'ok' }]);
			expect(
				verified.handle.query('PRAGMA foreign_key_check;').all()
			).toEqual([]);
		} finally {
			verified.close();
		}
	});

	it('rolls the whole promotion back when any table fails', () => {
		const staging = stageTwoPlans(1000);
		expect(staging.status).toBe('ok');

		// Seed the active DB with a ledger row and a guard trigger that
		// aborts halfway through the plans loop.
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.handle.exec(`
			INSERT INTO outbox (
				idempotency_key, kind, payload, next_attempt_at, created_at, updated_at
			) VALUES ('keep-outbox', 'test', '{}', 902, 902, 902);
			CREATE TRIGGER promote_guard BEFORE INSERT ON plans
			WHEN NEW.uid = 'q00002'
			BEGIN
				SELECT RAISE(ABORT, 'promotion guard');
			END;
		`);
		active.close();

		const before = snapshot(activePath);

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'x00528',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toContain('promotion guard');

		// Nothing landed: not the proposals applied before the failing
		// plan, not the first plan, not the promote run row. The
		// operational ledger is untouched.
		const after = snapshot(activePath);
		expect(after).toEqual(before);
		expect(after.proposals).toEqual([]);
		expect(after.plans).toEqual([]);
		expect(after.slices).toEqual([]);
		expect(after.reconciliation_runs).toEqual([]);
		expect(after.outbox).toHaveLength(1);
	});

	it('rejects a digest mismatch without changing the active database', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'def5678',
			sha: 'tree-def5678',
			files: [],
			now: 1000,
		});
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.handle.exec(`
			INSERT INTO proposals (
				uid, slug, kind, status, title, revision, created_at, updated_at
			) VALUES ('keep', 'keep', 'fix', 'ready', 'Keep', 0, 1, 1);
		`);
		active.close();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'def5678',
			expectedDigest: 'different-digest',
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toContain('digest');
		expect(result.failedStagingPath).not.toBeNull();
		expect(staging.stagingPath).not.toBe(result.failedStagingPath);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			expect(
				verified.handle.query('SELECT uid FROM proposals').all()
			).toEqual([{ uid: 'keep' }]);
			expect(
				verified.handle
					.query('SELECT id FROM reconciliation_runs')
					.all()
			).toHaveLength(0);
		} finally {
			verified.close();
		}
	});
});
