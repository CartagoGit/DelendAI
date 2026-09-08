import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver, reconcileShadowToStaging } from '../../src';
import {
	largeProposalSet,
	CORRUPT_FILE_COUNT,
	EXPECTED_FILE_COUNT,
	EXPECTED_PLAN_COUNT,
	EXPECTED_PROPOSAL_COUNT,
	EXPECTED_SLICE_COUNT,
} from '../fixtures/large-proposal-set';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-digest-rebuild-'));

interface ICountRow {
	readonly total: number;
}

const countRows = (driver: ProposalsSqliteDriver, sql: string): number =>
	driver.handle.query<ICountRow, []>(sql).get()?.total ?? 0;

describe('rebuild digest parity (a00094 S1, widened by x00528 S3)', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('returns the same logical digest after deleting and rebuilding the active DB', () => {
		const rootDir = makeTmpDir();
		roots.push(rootDir);
		const statePath = join(rootDir, '.delendai', 'state');
		const activePath = join(statePath, 'proposals.sqlite');
		const files = largeProposalSet();
		const baseInput = {
			mode: 'shadow' as const,
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'fixture-commit',
			sha: 'fixture-tree',
			files,
		};

		const baseline = reconcileShadowToStaging({
			...baseInput,
			now: Date.parse('2026-09-07T12:00:00.000Z'),
		});
		// The fixture deliberately carries corrupt entries, so a healthy
		// run is `degraded` (quarantined > 0), never `failed`.
		expect(baseline.status).toBe('degraded');
		expect(baseline.integrity.status).toBe('ok');
		expect(baseline.foreignKey.status).toBe('ok');
		expect(baseline.error).toBeNull();
		expect(baseline.filesSeen).toBe(EXPECTED_FILE_COUNT);
		expect(baseline.proposalsStaged).toBe(EXPECTED_PROPOSAL_COUNT);
		expect(baseline.plansStaged).toBe(EXPECTED_PLAN_COUNT);
		expect(baseline.slicesStaged).toBe(EXPECTED_SLICE_COUNT);
		expect(existsSync(baseline.stagingPath)).toBe(true);
		renameSync(baseline.stagingPath, activePath);
		const digestBefore = baseline.stagingDigest;

		// The projection actually reached SQLite: three tables, the
		// closed_at parity of 0008 honoured, and the corrupt files
		// parked in quarantine instead of aborting the run.
		const seeded = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			expect(
				countRows(seeded, 'SELECT COUNT(*) AS total FROM proposals'),
			).toBe(EXPECTED_PROPOSAL_COUNT);
			expect(
				countRows(seeded, 'SELECT COUNT(*) AS total FROM plans'),
			).toBe(EXPECTED_PLAN_COUNT);
			expect(
				countRows(seeded, 'SELECT COUNT(*) AS total FROM slices'),
			).toBe(EXPECTED_SLICE_COUNT);
			expect(
				countRows(seeded, 'SELECT COUNT(*) AS total FROM quarantine'),
			).toBe(CORRUPT_FILE_COUNT);
			expect(
				countRows(
					seeded,
					`SELECT COUNT(*) AS total FROM plans
					 WHERE status IN ('done','retired','superseded','quarantined')
					   AND closed_at IS NOT NULL`,
				),
			).toBeGreaterThan(0);
			expect(
				countRows(
					seeded,
					`SELECT COUNT(*) AS total FROM slices
					 WHERE status = 'done' AND closed_at IS NOT NULL`,
				),
			).toBeGreaterThan(0);
			expect(
				countRows(
					seeded,
					`SELECT COUNT(*) AS total FROM plans WHERE closed_at IS NULL
					   AND status IN ('done','retired','superseded','quarantined')`,
				),
			).toBe(0);
			// Slice uids stay `<proposalUid>.<sliceId>`.
			expect(
				countRows(
					seeded,
					`SELECT COUNT(*) AS total FROM slices
					 WHERE uid = 'q00001.S1'`,
				),
			).toBe(1);
		} finally {
			seeded.close();
		}

		for (let iteration = 0; iteration < 100; iteration += 1) {
			rmSync(activePath, { force: true });
			const rebuilt = reconcileShadowToStaging({
				...baseInput,
				now: Date.parse('2026-09-07T12:00:00.000Z') + iteration + 1,
			});

			expect(rebuilt.status).toBe('degraded');
			expect(rebuilt.integrity.status).toBe('ok');
			expect(rebuilt.foreignKey.status).toBe('ok');
			expect(rebuilt.error).toBeNull();
			expect(rebuilt.stagingDigest).toBe(digestBefore);
			expect(rebuilt.proposalsStaged).toBe(EXPECTED_PROPOSAL_COUNT);
			expect(rebuilt.plansStaged).toBe(EXPECTED_PLAN_COUNT);
			expect(rebuilt.slicesStaged).toBe(EXPECTED_SLICE_COUNT);
			expect(existsSync(rebuilt.stagingPath)).toBe(true);
			renameSync(rebuilt.stagingPath, activePath);
		}
	}, 60_000);

	it('keeps the digest independent of the order the files are read in', () => {
		const rootDir = makeTmpDir();
		roots.push(rootDir);
		const statePath = join(rootDir, '.delendai', 'state');
		const files = largeProposalSet();
		const baseInput = {
			mode: 'shadow' as const,
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'fixture-commit',
			sha: 'fixture-tree',
			now: Date.parse('2026-09-07T12:00:00.000Z'),
		};

		const forward = reconcileShadowToStaging({ ...baseInput, files });
		const reversed = reconcileShadowToStaging({
			...baseInput,
			files: [...files].reverse(),
		});

		expect(reversed.stagingDigest).toBe(forward.stagingDigest);
	}, 30_000);
});
