/**
 * real-tree-projection.spec.ts — x00539.
 *
 * The proof the other 95 tests could not give: this one projects the
 * ACTUAL `docs/delendai/proposals` tree, not a synthetic fixture.
 * Every defect x00539 fixes was found by running the pipeline against
 * this data for the first time (f00534) and none of them was caught by
 * the package's suite, because every fixture was clean.
 *
 * What it pins:
 *   - the run completes (it used to die at 547 of 895 proposals with
 *     `CHECK constraint failed` on `kind: infra`, and at 437 of 790
 *     plans with `UNIQUE constraint failed: plans.uid` on the
 *     duplicated `f00418`);
 *   - every markdown file is accounted for: projected or quarantined,
 *     nothing silently lost;
 *   - the six README.md files quarantine and the run is `degraded` —
 *     and a `degraded` run is promoted (x00539 S2).
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	applyValidatedCandidate,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
	type IReconcilerInputFile,
} from '../../src';

const REPO_ROOT = resolve(import.meta.dir, '../../../..');
const PROPOSALS_ROOT = join(REPO_ROOT, 'docs/delendai/proposals');

const walk = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (path.endsWith('.md')) out.push(path);
	}
	return out;
};

const readTree = (): readonly IReconcilerInputFile[] =>
	walk(PROPOSALS_ROOT)
		.sort()
		.map((path) => ({
			path: relative(REPO_ROOT, path),
			sha: `blob-${relative(REPO_ROOT, path)}`,
			raw: readFileSync(path, 'utf8'),
		}));

describe('projection of the real proposals tree (x00539)', () => {
	it('projects every markdown file in docs/delendai/proposals: nothing aborts, nothing is lost', () => {
		expect(existsSync(PROPOSALS_ROOT)).toBe(true);
		const files = readTree();
		expect(files.length).toBeGreaterThan(800);

		const rootDir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-real-'));
		try {
			const paths = resolveProposalsDbPaths(rootDir);
			const staging = reconcileShadowToStaging({
				mode: 'shadow',
				workspacePath: rootDir,
				statePath: paths.stateDir,
				sourceCommit: 'real-tree',
				sha: 'real-tree',
				files,
				now: 1_000,
			});

			// The run finishes. It never used to.
			expect(staging.error).toBeNull();
			expect(staging.failedStagingPath).toBeNull();
			expect(staging.integrity.status).toBe('ok');
			expect(staging.foreignKey.status).toBe('ok');
			expect(staging.filesSeen).toBe(files.length);

			const db = new ProposalsSqliteDriver({
				path: staging.stagingPath,
				readonly: true,
			});
			try {
				const count = (table: string): number =>
					db.handle
						.query<{ readonly count: number }, []>(
							`SELECT COUNT(*) AS count FROM ${table}`,
						)
						.get()?.count ?? 0;

				const declaredIds = files
					.map(
						(file) =>
							/^---\r?\n[\s\S]*?^id:\s*(\S+)\s*$/m.exec(
								file.raw,
							)?.[1],
					)
					.filter((id): id is string => id !== undefined);
				const distinctIds = new Set(declaredIds);
				const duplicates = declaredIds.length - distinctIds.size;

				// Every markdown file is accounted for: one proposal row
				// per distinct id, one quarantine row per file the
				// projection cannot represent, and the rest are extra
				// files re-declaring an id that already has a row.
				expect(count('proposals')).toBe(distinctIds.size);
				expect(staging.proposalsStaged).toBe(distinctIds.size);
				expect(
					distinctIds.size + staging.quarantinedEntries + duplicates,
				).toBe(files.length);

				// The three `kind: infra` files that used to abort the
				// whole run at proposal 547.
				const infra = db.handle
					.query<{ readonly uid: string }, []>(
						"SELECT uid FROM proposals WHERE kind = 'infra' ORDER BY uid",
					)
					.all()
					.map((row) => row.uid);
				expect(infra).toEqual(['i00002', 'i00003', 'i00004']);

				// The duplicated id: one row, not a UNIQUE failure.
				expect(
					db.handle
						.query<{ readonly count: number }, []>(
							"SELECT COUNT(*) AS count FROM plans WHERE uid = 'f00418'",
						)
						.get()?.count,
				).toBe(1);

				// The README.md files under the tree: quarantined with a
				// reason, never silently dropped.
				const quarantined = db.handle
					.query<
						{
							readonly source_path: string;
							readonly error_code: string;
						},
						[]
					>('SELECT source_path, error_code FROM quarantine')
					.all();
				expect(quarantined.length).toBe(staging.quarantinedEntries);
				expect(
					quarantined.every((row) =>
						row.source_path.endsWith('README.md'),
					),
				).toBe(true);
				expect(staging.status).toBe('degraded');
			} finally {
				db.close();
			}

			// x00539 S2 — a degraded run from THIS repository promotes.
			const applied = applyValidatedCandidate({
				stagingPath: staging.stagingPath,
				activePath: paths.databasePath,
				sourceCommit: 'real-tree',
				expectedDigest: staging.stagingDigest,
				now: 2_000,
			});
			expect(applied.status).toBe('ok');
			expect(applied.stagingStatus).toBe('degraded');
			expect(applied.quarantinedEntries).toBe(staging.quarantinedEntries);
			expect(applied.proposalsApplied).toBe(staging.proposalsStaged);
			expect(applied.plansApplied).toBe(staging.plansStaged);
			expect(applied.slicesApplied).toBe(staging.slicesStaged);

			// eslint-disable-next-line no-console
			console.log(
				`[x00539] real tree: ${String(files.length)} markdown files → ` +
					`${String(staging.proposalsStaged)} proposals, ` +
					`${String(staging.plansStaged)} plans, ` +
					`${String(staging.slicesStaged)} slices, ` +
					`${String(staging.quarantinedEntries)} quarantined, ` +
					`${String(files.length - staging.proposalsStaged - staging.quarantinedEntries)} duplicate-id files, ` +
					`status=${staging.status}, promoted=${applied.status}`,
			);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
