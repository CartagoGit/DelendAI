import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
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

	it('lists the shadow and promote audit rows for one source commit', () => {
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
				kind: 'promote',
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
});
