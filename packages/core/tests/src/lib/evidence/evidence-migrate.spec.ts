import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	EVIDENCE_MIGRATE_DEFAULT_BATCH_SIZE,
	migrateEvidenceFiles,
} from '@delendai/core/lib/evidence/evidence-migrate';
import { createEvidenceRepo } from '@delendai/core/lib/evidence/evidence-repo';
import type { IEvidenceRepo } from '@delendai/core/lib/evidence/evidence-repo';
import {
	EVIDENCE_DEFAULT_KEEP_LAST_N,
	EVIDENCE_TYPES,
} from '@delendai/core/lib/evidence/evidence-store';

const roots: string[] = [];
const repos: IEvidenceRepo[] = [];

afterEach(async () => {
	for (const repo of repos.splice(0)) {
		try {
			repo.close();
		} catch {
			// already closed by the test
		}
	}
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

interface IFixture {
	readonly evidenceRootAbs: string;
	readonly repo: IEvidenceRepo;
}

const envelope = (type: string, index: number): string =>
	`${JSON.stringify(
		{
			schemaVersion: 1,
			type,
			recordedAt: new Date(1_757_000_000_000 + index * 1_000).toISOString(),
			payload: { index, mode: 'managed' },
		},
		null,
		'\t',
	)}\n`;

/**
 * Builds a legacy-layout evidence root. `perType` files per type, the
 * same 289-byte-ish envelopes the file backend actually wrote.
 */
const makeFixture = async (
	perType: number,
	types: readonly string[] = ['surface', 'skills'],
): Promise<IFixture> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-evidence-migrate-'));
	roots.push(root);
	const evidenceRootAbs = join(root, 'evidence');
	for (const type of types) {
		await mkdir(join(evidenceRootAbs, type), { recursive: true });
		// Written in chunks so the fixture itself does not open 20.000
		// file handles at once.
		const chunk = 500;
		for (let start = 0; start < perType; start += chunk) {
			await Promise.all(
				Array.from(
					{ length: Math.min(chunk, perType - start) },
					(_, offset) => {
						const index = start + offset;
						return writeFile(
							join(
								evidenceRootAbs,
								type,
								`e-${String(index).padStart(6, '0')}.json`,
							),
							envelope(type, index),
							'utf8',
						);
					},
				),
			);
		}
	}
	const repo = createEvidenceRepo({ path: join(root, 'evidence.sqlite') });
	repos.push(repo);
	return { evidenceRootAbs, repo };
};

describe('evidence migrator (f00533 S3)', () => {
	it('imports every file once and deletes it only after the insert committed', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(30);

		const report = await migrateEvidenceFiles({
			evidenceRootAbs,
			repo,
			batchSize: 7,
		});

		expect(report.scanned).toBe(60);
		expect(report.migrated).toBe(60);
		expect(report.failed).toBe(0);
		expect(report.bytesReclaimed).toBeGreaterThan(0);

		// Rows landed...
		expect(repo.count()).toBe(60);
		expect(repo.countByType('surface')).toBe(30);
		expect(repo.countByType('skills')).toBe(30);
		// ...and the files are gone.
		expect(await readdir(join(evidenceRootAbs, 'surface'))).toEqual([]);
		expect(await readdir(join(evidenceRootAbs, 'skills'))).toEqual([]);

		expect(repo.integrityCheck()).toEqual(['ok']);
	});

	it('preserves the envelope verbatim and its recorded timestamp', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(3, ['surface']);
		await migrateEvidenceFiles({ evidenceRootAbs, repo });

		const rows = repo.listByType('surface');
		expect(rows).toHaveLength(3);
		const newest = rows[0];
		expect(newest?.sourceKey).toBe('surface/e-000002.json');
		expect(newest?.recordedAt).toBe(
			Date.parse(new Date(1_757_000_000_000 + 2_000).toISOString()),
		);
		const parsed = JSON.parse(newest?.payload ?? '{}') as {
			schemaVersion: number;
			type: string;
			payload: { index: number };
		};
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.type).toBe('surface');
		expect(parsed.payload.index).toBe(2);
	});

	it('is idempotent: a second run over the same root is a no-op', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(20, ['surface']);
		const first = await migrateEvidenceFiles({ evidenceRootAbs, repo });
		expect(first.migrated).toBe(20);

		const second = await migrateEvidenceFiles({ evidenceRootAbs, repo });
		expect(second.scanned).toBe(0);
		expect(second.migrated).toBe(0);
		expect(repo.count()).toBe(20);
	});

	it('resumes after a crash between commit and delete without duplicating rows', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(10, ['surface']);

		// Simulate exactly the crash window: the rows are committed but
		// the files were never unlinked. `dryRun: false` cannot express
		// this, so the inserts are replayed straight into the repo the
		// way the migrator's own flush would have.
		const filesBefore = await readdir(join(evidenceRootAbs, 'surface'));
		expect(filesBefore).toHaveLength(10);
		await migrateEvidenceFiles({
			evidenceRootAbs,
			repo,
			// A dry run reads and parses every file and leaves them all
			// on disk; combining it with a real append below reproduces
			// the half-finished state.
			dryRun: true,
		});
		// Now really insert them, still leaving the files in place.
		const staged = await migrateEvidenceFiles({
			evidenceRootAbs,
			repo,
			batchSize: 4,
		});
		expect(staged.migrated).toBe(10);
		expect(repo.count()).toBe(10);

		// Re-create the files as if the unlink never happened, then run
		// again: `INSERT OR IGNORE` on `source_key` must keep the count
		// at 10 while still clearing the directory.
		for (const name of filesBefore) {
			const index = Number.parseInt(name.slice(2, 8), 10);
			await writeFile(
				join(evidenceRootAbs, 'surface', name),
				envelope('surface', index),
				'utf8',
			);
		}
		const resumed = await migrateEvidenceFiles({ evidenceRootAbs, repo });
		expect(resumed.scanned).toBe(10);
		expect(resumed.migrated).toBe(10);
		expect(repo.count()).toBe(10);
		expect(await readdir(join(evidenceRootAbs, 'surface'))).toEqual([]);
		expect(repo.integrityCheck()).toEqual(['ok']);
	});

	it('leaves an unparseable file on disk and reports it instead of losing it', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(3, ['surface']);
		await writeFile(
			join(evidenceRootAbs, 'surface', 'broken.json'),
			'{not json',
			'utf8',
		);

		const report = await migrateEvidenceFiles({ evidenceRootAbs, repo });
		expect(report.scanned).toBe(4);
		expect(report.migrated).toBe(3);
		expect(report.failed).toBe(1);
		expect(report.failures[0]?.file.endsWith('broken.json')).toBe(true);
		expect(await readdir(join(evidenceRootAbs, 'surface'))).toEqual([
			'broken.json',
		]);
	});

	it('dry-runs without writing a row or deleting a file', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(5, ['surface']);
		const report = await migrateEvidenceFiles({
			evidenceRootAbs,
			repo,
			dryRun: true,
		});
		expect(report.dryRun).toBe(true);
		expect(report.scanned).toBe(5);
		expect(repo.count()).toBe(0);
		expect(await readdir(join(evidenceRootAbs, 'surface'))).toHaveLength(5);
	});

	it('skips type directories that do not exist', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(2, ['surface']);
		const report = await migrateEvidenceFiles({
			evidenceRootAbs,
			repo,
			types: EVIDENCE_TYPES,
		});
		expect(report.scanned).toBe(2);
		expect(report.failed).toBe(0);
	});

	it('rejects a nonsensical batch size', async () => {
		const { evidenceRootAbs, repo } = await makeFixture(1, ['surface']);
		await expect(
			migrateEvidenceFiles({ evidenceRootAbs, repo, batchSize: 0 }),
		).rejects.toThrow('batchSize');
	});

	// f00533 S3 acceptance, verbatim: "Sobre un fixture de 20.000
	// ficheros, la migracion no carga todo en memoria y opera por lotes."
	it(
		'migrates a 20.000-file fixture in bounded batches',
		async () => {
			const batchSize = EVIDENCE_MIGRATE_DEFAULT_BATCH_SIZE;
			const { evidenceRootAbs, repo } = await makeFixture(10_000, [
				'surface',
				'skills',
			]);

			const observedSizes: number[] = [];
			const heapBefore = process.memoryUsage().heapUsed;
			const startedAt = performance.now();
			const report = await migrateEvidenceFiles({
				evidenceRootAbs,
				repo,
				batchSize,
				onBatch: (batch) => observedSizes.push(batch.size),
			});
			const elapsedMs = performance.now() - startedAt;
			const heapDeltaMb =
				(process.memoryUsage().heapUsed - heapBefore) / 1_048_576;

			expect(report.scanned).toBe(20_000);
			expect(report.migrated).toBe(20_000);
			expect(report.failed).toBe(0);
			expect(repo.count()).toBe(20_000);

			// "Operates in batches": one flush per `batchSize` files, and
			// NO batch ever exceeded that size — which is the testable
			// form of "does not load everything into memory".
			expect(observedSizes).toHaveLength(20_000 / batchSize);
			expect(Math.max(...observedSizes)).toBeLessThanOrEqual(batchSize);
			expect(report.batches).toBe(observedSizes.length);

			expect(await readdir(join(evidenceRootAbs, 'surface'))).toEqual([]);
			expect(await readdir(join(evidenceRootAbs, 'skills'))).toEqual([]);
			expect(repo.integrityCheck()).toEqual(['ok']);

			console.log(
				`[f00533 S3] 20.000 files migrated in ${elapsedMs.toFixed(0)}ms ` +
					`across ${report.batches} batches of <=${batchSize}; ` +
					`${(report.bytesReclaimed / 1_048_576).toFixed(2)} MB of JSON reclaimed; ` +
					`heap delta ${heapDeltaMb.toFixed(1)} MB`,
			);
		},
		300_000,
	);
});

/**
 * The "after" half of the S3 documentation acceptance. The "before"
 * (25.533 files / 185 MB) was measured on the real cache root; this
 * measures the bounded steady state the new policy produces, so the
 * number recorded in `docs/delendai/PROJECT-OBSERVABILITY.md` is a
 * measurement rather than an arithmetic claim.
 */
describe('evidence steady state under the new bounds (f00533 S3)', () => {
	it('measures the capped on-disk size at the default keepLastN', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-evidence-cap-'));
		roots.push(root);
		const dbPath = join(root, 'evidence.sqlite');
		const repo = createEvidenceRepo({ path: dbPath });
		repos.push(repo);

		// Well past the ceiling on every type, using the measured
		// 289-byte envelope size as the payload width.
		const payload = `${JSON.stringify({
			schemaVersion: 1,
			type: 'surface',
			recordedAt: '2026-09-08T00:00:00.000Z',
			payload: { pad: 'x'.repeat(180) },
		})}`;
		const perType = 3_000;
		for (const type of EVIDENCE_TYPES) {
			repo.appendMany(
				Array.from({ length: perType }, (_, index) => ({
					type,
					recordedAt: Date.now() - (perType - index) * 1_000,
					payload,
				})),
			);
		}
		expect(repo.count()).toBe(perType * EVIDENCE_TYPES.length);

		for (const type of EVIDENCE_TYPES) {
			repo.prune({ type, keepLastN: EVIDENCE_DEFAULT_KEEP_LAST_N });
		}
		const cappedRows = EVIDENCE_DEFAULT_KEEP_LAST_N * EVIDENCE_TYPES.length;
		expect(repo.count()).toBe(cappedRows);
		expect(repo.integrityCheck()).toEqual(['ok']);

		// VACUUM returns the freed pages to the filesystem, which is
		// what an operator sees after the first capped cleanup.
		repo.vacuum();
		repo.close();
		repos.length = 0;

		const bytes = (await stat(dbPath)).size;
		console.log(
			`[f00533 S3] steady state: ${cappedRows} rows across ` +
				`${EVIDENCE_TYPES.length} types in 1 file, ` +
				`${(bytes / 1_048_576).toFixed(2)} MB ` +
				`(payload ${payload.length} bytes/entry)`,
		);
		// Guard rail, not a precise expectation: the whole point is that
		// the store can no longer reach hundreds of megabytes.
		expect(bytes).toBeLessThan(32 * 1_048_576);
	});
});
