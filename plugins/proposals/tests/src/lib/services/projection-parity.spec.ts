/**
 * projection-parity.spec.ts — f00534 S3.
 *
 * `bun test`, never vitest (bun:sqlite).
 *
 * Two layers:
 *
 *  1. Pure tests of `compareProjectionParity` — the classification of
 *     only-in-SQL / only-in-JSON / status-divergent, with no I/O.
 *  2. One MEASUREMENT against this actual repository. The acceptance is
 *     explicit that the divergence must be measured, not asserted to be
 *     zero: the test therefore projects the real proposal markdown into
 *     a throwaway database, compares it against the index the runtime
 *     really reads (`.cache/delendai/proposals/index.json`), and PRINTS
 *     the classified numbers. It asserts only the properties that must
 *     hold whatever the numbers are — that both sides were actually
 *     read, and that every id the runtime knows is accounted for in
 *     exactly one bucket. A divergence is a finding, not a failure.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver } from '@delendai/proposals-sqlite';

import {
	compareProjectionParity,
	runtimeIndexEntries,
	type IProjectionEntry,
} from '../../../../src/lib/services/projection-parity';
import { reconcileProposalsDb } from '../../../../src/lib/tools/db-reconcile.tool';

describe('compareProjectionParity — pure classification (f00534 S3)', () => {
	it('reports parity when both sides carry the same ids and statuses', () => {
		const both: readonly IProjectionEntry[] = [
			{ id: 'f00001', status: 'done' },
			{ id: 'f00002', status: 'ready' },
		];
		const report = compareProjectionParity({ sql: both, json: [...both] });
		expect(report.inParity).toBe(true);
		expect(report.sqlCount).toBe(2);
		expect(report.jsonCount).toBe(2);
		expect(report.sharedCount).toBe(2);
		expect(report.agreeingCount).toBe(2);
		expect(report.onlyInSql).toEqual([]);
		expect(report.onlyInJson).toEqual([]);
		expect(report.statusDivergent).toEqual([]);
	});

	it('classifies the three kinds of difference separately', () => {
		const report = compareProjectionParity({
			sql: [
				{ id: 'shared-agree', status: 'done' },
				{ id: 'shared-differ', status: 'ready' },
				{ id: 'sql-only', status: 'draft' },
			],
			json: [
				{ id: 'shared-agree', status: 'done' },
				{ id: 'shared-differ', status: 'review' },
				{ id: 'json-only', status: 'done' },
			],
		});

		expect(report.onlyInSql).toEqual(['sql-only']);
		expect(report.onlyInJson).toEqual(['json-only']);
		expect(report.statusDivergent).toEqual([
			{ id: 'shared-differ', sql: 'ready', json: 'review' },
		]);
		expect(report.sharedCount).toBe(2);
		expect(report.agreeingCount).toBe(1);
		expect(report.inParity).toBe(false);
	});

	it('handles an empty side without pretending it agrees', () => {
		const report = compareProjectionParity({
			sql: [],
			json: [{ id: 'f00001', status: 'done' }],
		});
		expect(report.inParity).toBe(false);
		expect(report.onlyInJson).toEqual(['f00001']);
		expect(report.sqlCount).toBe(0);
	});

	it('reads the runtime index shape and skips identity-less rows', () => {
		const entries = runtimeIndexEntries({
			proposals: [
				{ id: 'f00001', status: 'done' },
				{ status: 'done' },
				{ id: 'f00002' },
			],
		});
		expect(entries).toEqual([
			{ id: 'f00001', status: 'done' },
			{ id: 'f00002', status: '' },
		]);
	});
});

const REPO_ROOT = join(import.meta.dirname, '../../../../../..');
const REAL_PROPOSALS_DIR = join(REPO_ROOT, 'docs/delendai/proposals');
const RUNTIME_INDEX = join(REPO_ROOT, '.cache/delendai/proposals/index.json');

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('projection parity — MEASURED on this repository (f00534 S3)', () => {
	it('measures the divergence between the SQL projection and the runtime index', () => {
		if (!existsSync(RUNTIME_INDEX) || !existsSync(REAL_PROPOSALS_DIR)) {
			// A consumer checkout without a warmed cache has nothing to
			// measure. Skipping is honest; asserting zero would not be.
			return;
		}

		// Project the REAL markdown into a throwaway database, so the
		// measurement never depends on a committed .sqlite file and never
		// writes into the developer's own state directory.
		const root = mkdtempSync(join(tmpdir(), 'projection-parity-'));
		roots.push(root);
		const run = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: REAL_PROPOSALS_DIR,
			sourceCommit: 'parity-measurement',
			now: 1_760_000_000_000,
		});
		expect(run.status).toBe('ok');

		const driver = new ProposalsSqliteDriver({
			path: run.databasePath,
			readonly: true,
		});
		let sql: readonly IProjectionEntry[];
		try {
			sql = driver.handle
				.query<{ id: string; status: string }, []>(
					'SELECT uid AS id, status FROM proposals ORDER BY uid',
				)
				.all();
		} finally {
			driver.close();
		}

		const json = runtimeIndexEntries(
			JSON.parse(readFileSync(RUNTIME_INDEX, 'utf8')) as {
				proposals?: readonly { id?: unknown; status?: unknown }[];
			},
		);

		const report = compareProjectionParity({ sql, json });

		// eslint-disable-next-line no-console
		console.log(
			[
				'',
				'f00534 S3 — MEASURED projection parity on this repository',
				`  markdown files scanned      : ${String(run.filesScanned)}`,
				`  files excluded by pre-flight: ${String(run.excludedCount)}`,
				`  SQL projection proposals    : ${String(report.sqlCount)}`,
				`  runtime index proposals     : ${String(report.jsonCount)}`,
				`  shared ids                  : ${String(report.sharedCount)}`,
				`  shared AND status-agreeing  : ${String(report.agreeingCount)}`,
				`  only in SQL                 : ${String(report.onlyInSql.length)}`,
				`  only in JSON                : ${String(report.onlyInJson.length)}`,
				`  status divergent            : ${String(report.statusDivergent.length)}`,
				`  in parity                   : ${String(report.inParity)}`,
				`  excluded paths              : ${run.excluded.map((e) => `${e.path} (${e.code})`).join(', ')}`,
				`  only-in-JSON ids            : ${report.onlyInJson.slice(0, 20).join(', ')}`,
				`  divergent (first 20)        : ${report.statusDivergent
					.slice(0, 20)
					.map((d) => `${d.id} sql=${d.sql} json=${d.json}`)
					.join(', ')}`,
				'',
			].join('\n'),
		);

		// Properties that hold whatever the divergence is: both sides were
		// really read, and every runtime id lands in exactly one bucket.
		expect(report.sqlCount).toBeGreaterThan(0);
		expect(report.jsonCount).toBeGreaterThan(0);
		expect(report.sharedCount + report.onlyInJson.length).toBe(
			report.jsonCount,
		);
		expect(report.sharedCount + report.onlyInSql.length).toBe(
			report.sqlCount,
		);
		expect(report.agreeingCount + report.statusDivergent.length).toBe(
			report.sharedCount,
		);
	}, 120_000);
});
