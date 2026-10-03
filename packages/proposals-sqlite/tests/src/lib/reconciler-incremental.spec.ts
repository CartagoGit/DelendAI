/**
 * reconciler-incremental.spec.ts — a pass over what changed, and
 * nothing else.
 *
 * The acceptance this closes is r00055's fourth: "mode incremental
 * aplica cambios a active SQLite, es idempotente y no duplica
 * lifecycle/outbox". Idempotence is PROVEN rather than asserted: the
 * result reports `unchanged` separately from `updated`, so a second
 * pass can show it changed nothing instead of being believed.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcileIncremental } from '../../../src/lib/reconciler-incremental.service';
import { resolveProposalsDbPaths } from '../../../src/lib/db-path';
import { ProposalsSqliteDriver } from '../../../src/lib/sqlite-driver';

let rootDir: string;
let activePath: string;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'proposals-incremental-'));
	const paths = resolveProposalsDbPaths(rootDir);
	activePath = paths.databasePath;
	mkdirSync(paths.stateDir, { recursive: true });
});

afterEach(() => {
	rmSync(rootDir, { recursive: true, force: true });
});

const file = (id: string, title: string) => ({
	path: `ready/fixes/${id}.md`,
	sha: `blob-${id}-${title}`,
	raw: `---\nid: ${id}\ntitle: ${title}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# ${title}`,
});

const countRows = (table: string): number => {
	const driver = new ProposalsSqliteDriver({ path: activePath });
	try {
		return (
			driver.handle
				.query<{ readonly n: number }, []>(
					`SELECT COUNT(*) AS n FROM ${table}`,
				)
				.get()?.n ?? 0
		);
	} finally {
		driver.close();
	}
};

describe('reconcileIncremental', () => {
	it('writes the change to the ACTIVE database', () => {
		const result = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files: [file('x00001', 'First')],
			now: 1000,
		});

		expect(result.status).toBe('ok');
		expect(result.proposalsCreated).toBe(1);
		expect(countRows('proposals')).toBe(1);
	});

	it('changes nothing on a second pass over the same files', () => {
		const files = [file('x00002', 'Same')];
		reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files,
			now: 1000,
		});
		const lifecycleAfterFirst = countRows('lifecycle_events');
		const outboxAfterFirst = countRows('outbox');

		const second = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files,
			now: 2000,
		});

		// Proven, not believed: `unchanged` is reported separately so a
		// repeat can show it did nothing.
		expect(second.proposalsUnchanged).toBe(1);
		expect(second.proposalsCreated).toBe(0);
		expect(second.proposalsUpdated).toBe(0);
		// And the ledgers a retry must never duplicate.
		expect(countRows('lifecycle_events')).toBe(lifecycleAfterFirst);
		expect(countRows('outbox')).toBe(outboxAfterFirst);
	});

	it('applies a real edit as an update', () => {
		reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files: [file('x00003', 'Before')],
			now: 1000,
		});

		const edited = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-2',
			files: [file('x00003', 'After')],
			now: 2000,
		});

		expect(edited.proposalsUpdated).toBe(1);
		expect(edited.proposalsUnchanged).toBe(0);
	});

	it('records an unparseable file instead of dropping it', () => {
		const result = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files: [
				{
					path: 'ready/fixes/broken.md',
					sha: 'blob-broken',
					raw: 'no frontmatter at all',
				},
			],
			now: 1000,
		});

		// Degraded is a real answer: the pass happened, and one file
		// could not be read. Silence would lose it.
		expect(result.status).toBe('degraded');
		expect(result.quarantined).toBe(1);
		expect(countRows('quarantine')).toBe(1);
	});

	it('leaves a run behind that says what it was', () => {
		const result = reconcileIncremental({
			databasePath: activePath,
			sourceCommit: 'commit-1',
			files: [file('x00004', 'Recorded')],
			now: 1000,
		});

		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			const run = driver.handle
				.query<{ readonly kind: string }, [number]>(
					'SELECT kind FROM reconciliation_runs WHERE id = ?',
				)
				.get(result.runId);

			// An incremental pass must be distinguishable from a promotion
			// in the ledger, or the history of the database stops being
			// readable.
			expect(run?.kind).toBe('incremental');
		} finally {
			driver.close();
		}
	});
});
