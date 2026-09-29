import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileIncremental,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../../src';
import {
	getReconciliationRun,
	listReconciliationRuns,
} from '../../../src/lib/reconciler-runs';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-runs-'));

describe('reconciliation runs surface (q00024 S3)', () => {
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

	it('lists the shadow and apply_candidate audit rows for one source commit', () => {
		const shadow = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'abc1234',
			sha: 'tree-abc1234',
			files: [],
			now: 1000,
		});
		const active = new ProposalsSqliteDriver({ path: activePath });
		active.close();

		const promoted = applyValidatedCandidate({
			stagingPath: shadow.stagingPath,
			activePath,
			sourceCommit: 'abc1234',
			expectedDigest: shadow.stagingDigest,
			now: 2000,
		});
		expect(promoted.status).toBe('ok');

		const verified = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			const runs = listReconciliationRuns(verified.handle, {
				sourceCommit: 'abc1234',
			});
			expect(runs).toHaveLength(1);
			expect(runs[0]).toMatchObject({
				sourceCommit: 'abc1234',
				status: 'ok',
				kind: 'apply_candidate',
				logicalDigest: shadow.stagingDigest,
				completedAt: 2000,
			});
			expect(
				listReconciliationRuns(verified.handle, { kind: 'shadow' }),
			).toHaveLength(0);
			expect(
				getReconciliationRun(verified.handle, runs[0]?.id ?? 0),
			).toEqual(runs[0]);
		} finally {
			verified.close();
		}

		const stagingDb = new ProposalsSqliteDriver({
			path: shadow.stagingPath,
			readonly: true,
		});
		try {
			expect(
				listReconciliationRuns(stagingDb.handle, {
					sourceCommit: 'abc1234',
				}),
			).toHaveLength(1);
		} finally {
			stagingDb.close();
		}
	});

	it('records every counter of a real run, not only its identity', () => {
		// q00024 S3's acceptance is that each run row carries its counters.
		// The case above reconciles an EMPTY tree, where every counter is
		// zero whether or not anything writes it — so nothing proved they
		// were written. This one gives each counter a value it could only
		// have if the reconciler counted.
		const workspacePath = join(rootDir, 'workspace');
		const proposal = (id: string, title: string) => ({
			path: `ready/fixes/${id}.md`,
			raw: `---\nid: ${id}\ntitle: ${title}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# ${title}`,
		});
		const runFor = (databasePath: string, sourceCommit: string) => {
			const db = new ProposalsSqliteDriver({
				path: databasePath,
				readonly: true,
			});
			try {
				return listReconciliationRuns(db.handle, { sourceCommit })[0];
			} finally {
				db.close();
			}
		};

		// Two new proposals: both are seen and both are created.
		const first = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'c0000001',
			sha: 'tree-c0000001',
			files: [proposal('x00001', 'One'), proposal('x00002', 'Two')],
			now: 1000,
		});
		expect(runFor(first.stagingPath, 'c0000001')).toMatchObject({
			kind: 'shadow',
			filesSeen: 2,
			entitiesCreated: 2,
			entitiesUpdated: 0,
			entitiesDeleted: 0,
			entitiesQuarantined: 0,
		});
		expect(
			applyValidatedCandidate({
				stagingPath: first.stagingPath,
				activePath,
				sourceCommit: 'c0000001',
				expectedDigest: first.stagingDigest,
				now: 1500,
			}).status,
		).toBe('ok');

		// Against that authority: one proposal edited, the other gone.
		const second = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'c0000002',
			sha: 'tree-c0000002',
			files: [proposal('x00001', 'One, renamed')],
			now: 2000,
		});
		expect(runFor(second.stagingPath, 'c0000002')).toMatchObject({
			kind: 'shadow',
			filesSeen: 1,
			entitiesCreated: 0,
			entitiesUpdated: 1,
			entitiesDeleted: 1,
			entitiesQuarantined: 0,
		});
	});

	it('returns an empty result for an unknown source or run id', () => {
		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			expect(
				listReconciliationRuns(driver.handle, {
					sourceCommit: 'missing',
				}),
			).toEqual([]);
			expect(getReconciliationRun(driver.handle, 999)).toBeNull();
		} finally {
			driver.close();
		}
	});

	it('records what an incremental pass created and its digest', () => {
		// The incremental row was written before the entities, as zero
		// created and a null digest, and never corrected.
		const file = (id: string) => ({
			path: `ready/fixes/${id}.md`,
			raw: `---\nid: ${id}\ntitle: T ${id}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# T ${id}`,
		});
		const first = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'inc-1',
			files: [file('x00901'), file('x00902')],
			now: 1000,
		});
		expect(first.proposalsCreated).toBe(2);
		const edited = {
			...file('x00901'),
			raw: file('x00901').raw.replace('T x00901', 'T x00901 edited'),
		};
		reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'inc-2',
			files: [edited],
			now: 2000,
		});

		const db = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			const [created] = listReconciliationRuns(db.handle, {
				sourceCommit: 'inc-1',
			});
			const [updated] = listReconciliationRuns(db.handle, {
				sourceCommit: 'inc-2',
			});
			expect(created).toMatchObject({
				kind: 'incremental',
				filesSeen: 2,
				entitiesCreated: 2,
				entitiesUpdated: 0,
			});
			expect(created?.logicalDigest).toMatch(/^[0-9a-f]{64}$/u);
			expect(updated).toMatchObject({
				entitiesCreated: 0,
				entitiesUpdated: 1,
			});
			expect(updated?.logicalDigest).not.toBe(created?.logicalDigest);
		} finally {
			db.close();
		}
	});
});
