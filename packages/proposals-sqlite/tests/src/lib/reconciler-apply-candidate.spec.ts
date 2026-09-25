import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	readActiveAuthority,
	reconcileIncremental,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-promote-'));

describe('applyValidatedCandidate (q00024 S2)', () => {
	let rootDir: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		const paths = resolveProposalsDbPaths(rootDir);
		statePath = paths.stateDir;
		activePath = paths.databasePath;
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
				verified.handle.query('SELECT id FROM lifecycle_events').all(),
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM outbox').all(),
			).toHaveLength(1);
			expect(
				verified.handle.query('SELECT id FROM mutation_commands').all(),
			).toHaveLength(1);
			expect(
				verified.handle
					.query<{ readonly kind: string }, []>(
						`SELECT kind FROM reconciliation_runs ORDER BY id DESC LIMIT 1`,
					)
					.get()?.kind,
			).toBe('apply_candidate');
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

	const snapshot = (
		path: string,
	): Record<string, readonly ISnapshotRow[]> => {
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
						`SELECT * FROM ${table} ORDER BY rowid`,
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
					.query<{ readonly uid: string }, []>(
						'SELECT uid FROM plans ORDER BY uid',
					)
					.all(),
			).toEqual([{ uid: 'q00001' }, { uid: 'q00002' }]);
			expect(
				verified.handle
					.query<{ readonly uid: string }, []>(
						'SELECT uid FROM slices ORDER BY uid',
					)
					.all(),
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
					.get()?.total,
			).toBe(4);
			// 0008 parity survived the promotion.
			expect(
				verified.handle
					.query<{ readonly closed_at: number | null }, [string]>(
						'SELECT closed_at FROM plans WHERE uid = ?',
					)
					.get('q00001')?.closed_at,
			).not.toBeNull();
			expect(
				verified.handle
					.query<{ readonly closed_at: number | null }, [string]>(
						'SELECT closed_at FROM plans WHERE uid = ?',
					)
					.get('q00002')?.closed_at,
			).toBeNull();
			expect(
				verified.handle
					.query<{ readonly integrity_check: string }, []>(
						'PRAGMA integrity_check;',
					)
					.all(),
			).toEqual([{ integrity_check: 'ok' }]);
			expect(
				verified.handle.query('PRAGMA foreign_key_check;').all(),
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

	it('x00539 S2 — promotes a degraded staging: a README.md among valid files does not block the rest', () => {
		// The exact shape of this repository: six README.md files live
		// under docs/delendai/proposals with no frontmatter at all. Each
		// one is quarantined, which makes the run `degraded` — and
		// `degraded` used to be rejected, so nothing could EVER have
		// been promoted from here.
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'degraded1',
			sha: 'tree-degraded1',
			files: [
				{
					path: 'README.md',
					sha: 'blob-readme',
					raw: '# Proposals\n\nHow this folder works.\n',
				},
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: One\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# One`,
				},
				{
					path: 'done/infras/i00002.md',
					sha: 'blob-i00002',
					raw: `---\nid: i00002\ntitle: Infra\nkind: infra\nstatus: done\ntype: proposal\ntrack: general\n---\n# Infra`,
				},
			],
			now: 1000,
		});
		expect(staging.status).toBe('degraded');
		expect(staging.quarantinedEntries).toBe(1);
		expect(staging.proposalsStaged).toBe(2);

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'degraded1',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('ok');
		expect(result.reason).toBeNull();
		expect(result.proposalsApplied).toBe(2);
		// degraded is never silent: the apply reports the count.
		expect(result.stagingStatus).toBe('degraded');
		expect(result.quarantinedEntries).toBe(1);

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			expect(
				verified.handle
					.query<{ readonly uid: string; readonly kind: string }, []>(
						'SELECT uid, kind FROM proposals ORDER BY uid',
					)
					.all(),
			).toEqual([
				{ uid: 'i00002', kind: 'infra' },
				{ uid: 'x00001', kind: 'fix' },
			]);
			const run = verified.handle
				.query<
					{
						readonly status: string;
						readonly entities_quarantined: number;
					},
					[]
				>(
					`SELECT status, entities_quarantined
					 FROM reconciliation_runs
					 WHERE kind = 'apply_candidate'
					 ORDER BY id DESC
					 LIMIT 1`,
				)
				.get();
			expect(run?.status).toBe('degraded');
			expect(run?.entities_quarantined).toBe(1);
		} finally {
			verified.close();
		}
	});

	it('x00539 S2 — still refuses a staging whose integrity is broken', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'broken1',
			sha: 'tree-broken1',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: One\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# One`,
				},
			],
			now: 1000,
		});
		expect(staging.status).toBe('ok');

		// Mark the staging run itself as failed: a run that failed is
		// the ONLY run status that still blocks promotion.
		const tamper = new ProposalsSqliteDriver({
			path: staging.stagingPath,
		});
		tamper.handle.exec(
			"UPDATE reconciliation_runs SET status = 'failed', error = 'boom' WHERE kind = 'shadow'",
		);
		tamper.close();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'broken1',
			now: 2000,
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toBe('staging reconciliation status is failed');
		expect(result.failedStagingPath).not.toBeNull();
		// Nothing was promoted: the active database was never even
		// created by the rejected apply.
		expect(existsSync(activePath)).toBe(false);
	});

	it('refuses a genuinely corrupt staging and leaves the active database, ledgers included, exactly as it was', () => {
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'corrupt1',
			sha: 'tree-corrupt1',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001',
					raw: `---\nid: x00001\ntitle: Staged\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# Staged`,
				},
			],
			now: 1000,
		});
		expect(staging.status).toBe('ok');
		// Corrupt it for real: a status the CHECK constraint forbids,
		// written with the constraint switched off. integrity_check
		// reports CHECK violations, so this is a broken domain invariant.
		const tamper = new ProposalsSqliteDriver({ path: staging.stagingPath });
		tamper.handle.exec('PRAGMA ignore_check_constraints = 1');
		tamper.handle.exec("UPDATE proposals SET status = 'bogus'");
		tamper.handle.exec('PRAGMA ignore_check_constraints = 0');
		tamper.close();

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
		/** Every row of every table, as sorted JSON (some tables have no rowid). */
		const dump = (): string => {
			const db = new ProposalsSqliteDriver({
				path: activePath,
				readonly: true,
			});
			try {
				const tables = db.handle
					.query<{ readonly name: string }, []>(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name",
					)
					.all()
					.map((row) => row.name);
				return JSON.stringify(
					tables.map((table) => [
						table,
						db.handle
							.query(`SELECT * FROM "${table}"`)
							.all()
							.map((row) => JSON.stringify(row))
							.sort(),
					]),
				);
			} finally {
				db.close();
			}
		};
		const before = dump();

		const result = applyValidatedCandidate({
			stagingPath: staging.stagingPath,
			activePath,
			sourceCommit: 'corrupt1',
			expectedDigest: staging.stagingDigest,
			now: 2000,
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toBe('staging integrity_check failed');
		expect(dump()).toBe(before);
		expect(before).toContain('keep-outbox');
		expect(before).toContain('keep-command');
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
				verified.handle.query('SELECT uid FROM proposals').all(),
			).toEqual([{ uid: 'keep' }]);
			expect(
				verified.handle
					.query('SELECT id FROM reconciliation_runs')
					.all(),
			).toHaveLength(0);
		} finally {
			verified.close();
		}
	});
});

describe('promotion is a compare-and-swap against the active database', () => {
	let rootDir: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		const paths = resolveProposalsDbPaths(rootDir);
		statePath = paths.stateDir;
		activePath = paths.databasePath;
		mkdirSync(statePath, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	const stageOne = (id: string, now: number) =>
		reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: `commit-${id}`,
			sha: `tree-${id}`,
			files: [
				{
					path: `ready/fixes/${id}.md`,
					sha: `blob-${id}`,
					raw: `---\nid: ${id}\ntitle: T\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# T`,
				},
			],
			now,
		});

	it('refuses a promotion built on an authority that has moved', () => {
		// A staging copy is built from a snapshot and promoted later.
		// Between those moments another reconciliation can promote a
		// NEWER commit; promoting this one afterwards would replace newer
		// authority with older, with both runs reporting success. That is
		// the lost update this project refuses everywhere else, and this
		// was the one place still deciding by arrival order.
		const first = stageOne('x00001', 1000);
		expect(
			applyValidatedCandidate({
				stagingPath: first.stagingPath,
				activePath,
				sourceCommit: 'commit-x00001',
				expectedDigest: first.stagingDigest,
				expectedActiveSourceCommit: null,
				now: 2000,
			}).status,
		).toBe('ok');

		const second = stageOne('x00002', 3000);
		const stale = applyValidatedCandidate({
			stagingPath: second.stagingPath,
			activePath,
			sourceCommit: 'commit-x00002',
			expectedDigest: second.stagingDigest,
			// Built believing the database had never been promoted.
			expectedActiveSourceCommit: null,
			now: 4000,
		});

		expect(stale.status).toBe('rejected');
		expect(stale.reason).toContain('active database has moved');
		// Nothing written: the transaction returned before its first
		// statement, so the applied counts are zero.
		expect(stale.proposalsApplied).toBe(0);
	});

	it('accepts a promotion that names the authority it actually found', () => {
		const first = stageOne('x00003', 1000);
		applyValidatedCandidate({
			stagingPath: first.stagingPath,
			activePath,
			sourceCommit: 'commit-x00003',
			expectedDigest: first.stagingDigest,
			expectedActiveSourceCommit: null,
			now: 2000,
		});

		const second = stageOne('x00004', 3000);
		const fresh = applyValidatedCandidate({
			stagingPath: second.stagingPath,
			activePath,
			sourceCommit: 'commit-x00004',
			expectedDigest: second.stagingDigest,
			expectedActiveSourceCommit: 'commit-x00003',
			now: 4000,
		});

		expect(fresh.status).toBe('ok');
	});

	it('counts an incremental pass as authority, not only a promotion', () => {
		// The fence originally read the newest run of kind 'promote'.
		// An incremental pass writes to the active database without
		// promoting anything, so a staging copy built BEFORE that pass
		// would have been accepted and would have overwritten it — the
		// lost update the fence exists to refuse, reachable through the
		// mode the same slice introduced.
		const first = stageOne('x00007', 1000);
		applyValidatedCandidate({
			stagingPath: first.stagingPath,
			activePath,
			sourceCommit: 'commit-x00007',
			expectedDigest: first.stagingDigest,
			expectedActiveSourceCommit: null,
			now: 2000,
		});
		expect(readActiveAuthority(activePath)).toBe('commit-x00007');

		reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-incremental',
			files: [
				{
					path: 'ready/fixes/x00008.md',
					sha: 'blob-x00008',
					raw: '---\nid: x00008\ntitle: T\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# T',
				},
			],
			now: 3000,
		});
		expect(readActiveAuthority(activePath)).toBe('commit-incremental');

		const stale = stageOne('x00009', 4000);
		const rejectedPromotion = applyValidatedCandidate({
			stagingPath: stale.stagingPath,
			activePath,
			sourceCommit: 'commit-x00009',
			expectedDigest: stale.stagingDigest,
			// What the caller saw before the incremental pass ran.
			expectedActiveSourceCommit: 'commit-x00007',
			now: 5000,
		});

		expect(rejectedPromotion.status).toBe('rejected');
		expect(rejectedPromotion.reason).toContain('commit-incremental');
		expect(rejectedPromotion.proposalsApplied).toBe(0);
	});

	it('reports no authority for a database that does not exist yet', () => {
		// The pre-read is what a caller uses to decide what to expect,
		// and on a first run there is no database at all. Answering
		// `null` is what makes the first promotion fence correctly
		// instead of throwing.
		expect(readActiveAuthority(join(rootDir, 'absent.sqlite'))).toBeNull();
	});

	it('leaves a caller that does not fence exactly as it was', () => {
		// Omitting the field keeps the previous behaviour, so no existing
		// caller changes meaning by upgrading — but a caller that CAN
		// observe the active state and does not pass it is choosing
		// last-writer-wins.
		const staged = stageOne('x00005', 1000);
		expect(
			applyValidatedCandidate({
				stagingPath: staged.stagingPath,
				activePath,
				sourceCommit: 'commit-x00005',
				expectedDigest: staged.stagingDigest,
				now: 2000,
			}).status,
		).toBe('ok');
	});
});

describe('a disappearance the staging run classified must survive promotion', () => {
	let rootDir: string;
	let statePath: string;
	let activePath: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
		const paths = resolveProposalsDbPaths(rootDir);
		statePath = paths.stateDir;
		activePath = paths.databasePath;
		mkdirSync(statePath, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	const stage = (
		id: string,
		files: readonly { path: string; sha: string; raw: string }[],
		now: number,
	) =>
		reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: `commit-${id}`,
			sha: `tree-${id}`,
			files,
			now,
		});

	const proposalFile = (id: string) => ({
		path: `ready/fixes/${id}.md`,
		sha: `blob-${id}`,
		raw: `---\nid: ${id}\ntitle: T\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# T`,
	});

	it('marks the entity retired in the active database, not just in staging', () => {
		// reconcileTombstones compares the ACTIVE database against the
		// paths the commit carries and records its verdict INTO staging.
		// Promotion carried proposals, plans, slices and quarantine and
		// left those verdicts behind — so an entity whose file had gone
		// stayed alive in active with nothing saying otherwise. The
		// classification was made and then dropped on the floor.
		const first = stage('x00001', [proposalFile('x00001')], 1000);
		applyValidatedCandidate({
			stagingPath: first.stagingPath,
			activePath,
			sourceCommit: 'commit-x00001',
			expectedDigest: first.stagingDigest,
			now: 2000,
		});

		// The file is gone in the next commit.
		const second = stage('x00002', [proposalFile('x00002')], 3000);
		const promoted = applyValidatedCandidate({
			stagingPath: second.stagingPath,
			activePath,
			sourceCommit: 'commit-x00002',
			expectedDigest: second.stagingDigest,
			now: 4000,
		});

		expect(promoted.status).toBe('ok');
		expect(promoted.tombstonesApplied).toBeGreaterThan(0);

		const active = new ProposalsSqliteDriver({ path: activePath });
		try {
			const row = active.handle
				.query<
					{
						readonly deleted_at: number | null;
						readonly tombstone_reason: string | null;
					},
					[string]
				>(
					'SELECT deleted_at, tombstone_reason FROM proposals WHERE uid = ?',
				)
				.get('x00001');

			// Not merely recorded somewhere: the row itself says it is
			// gone, so a reader that never looks at the tombstones table
			// still cannot mistake it for live work.
			expect(row?.deleted_at).not.toBeNull();
			expect(row?.tombstone_reason).not.toBeNull();
		} finally {
			active.close();
		}
	});

	it('reports zero when nothing disappeared', () => {
		// The count has to distinguish a quiet promotion from one that
		// retired work; always reporting it is what makes that possible.
		const only = stage('x00003', [proposalFile('x00003')], 1000);
		const promoted = applyValidatedCandidate({
			stagingPath: only.stagingPath,
			activePath,
			sourceCommit: 'commit-x00003',
			expectedDigest: only.stagingDigest,
			now: 2000,
		});

		expect(promoted.status).toBe('ok');
		expect(promoted.tombstonesApplied).toBe(0);
	});
});
