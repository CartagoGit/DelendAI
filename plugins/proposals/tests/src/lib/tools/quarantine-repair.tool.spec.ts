import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	QuarantineRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	runQuarantineRepair,
	quarantineRepairInputSchema,
} from '../../../../src/lib/tools/quarantine-repair.tool';
import { runQuarantineList } from '../../../../src/lib/tools/quarantine-list.tool';

const makeWorkspace = (): { root: string; dbPath: string } => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-quarantine-repair-'));
	return {
		root,
		dbPath: resolveProposalsDbPaths(root).databasePath,
	};
};

const insertRun = (driver: ProposalsSqliteDriver): number => {
	const result = driver.handle
		.prepare(
			`INSERT INTO reconciliation_runs (
				reconciler_version, schema_version, started_at, status
			) VALUES (?, ?, ?, 'degraded')`,
		)
		.run('test', driver.schemaVersion, 100);
	return Number(result.lastInsertRowid);
};

const addQuarantine = (
	root: string,
	sourcePath: string,
	blobSha: string,
): number => {
	const driver = new ProposalsSqliteDriver({
		path: resolveProposalsDbPaths(root).databasePath,
	});
	try {
		return new QuarantineRepo(driver.handle).record({
			sourcePath,
			blobSha,
			errorCode: 'parse_failed',
			errorMessage: 'invalid markdown',
			runId: insertRun(driver),
			now: 100,
		}).id;
	} finally {
		driver.close();
	}
};

describe('runQuarantineRepair', () => {
	let root: string;

	beforeEach(() => {
		root = makeWorkspace().root;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('marks an entry ignored without deleting it', () => {
		const id = addQuarantine(root, 'ready/fixes/bad.md', 'blob-ignored');
		const output = runQuarantineRepair(
			{ workspaceRoot: root },
			quarantineRepairInputSchema.parse({
				id,
				action: 'mark-ignored',
				note: 'confirmed obsolete',
			}),
		);

		expect(output.total).toBe(1);
		expect(output.entries[0]?.status).toBe('ignored');
		expect(output.entries[0]?.resolutionNote).toBe('confirmed obsolete');
	});

	it('re-parses a repaired file, projects it, and resolves the quarantine entry', () => {
		const sourcePath = 'ready/fixes/x00999-repaired.md';
		const id = addQuarantine(root, sourcePath, 'blob-repaired');
		const absolutePath = join(root, sourcePath);
		mkdirSync(dirname(absolutePath), { recursive: true });
		writeFileSync(
			absolutePath,
			'---\nid: x00999\ntitle: Repaired\nkind: fix\nstatus: ready\ntype: proposal\ntrack: architecture\n---\n# Repaired\n',
			'utf8',
		);

		const output = runQuarantineRepair(
			{ workspaceRoot: root },
			quarantineRepairInputSchema.parse({
				id,
				action: 're-parse',
				note: 'fixed markdown',
			}),
		);
		expect(output.entries[0]?.status).toBe('resolved');
		expect(output.entries[0]?.resolutionNote).toBe('fixed markdown');

		const driver = new ProposalsSqliteDriver({
			path: resolveProposalsDbPaths(root).databasePath,
			readonly: true,
		});
		try {
			const proposal = driver.handle
				.query<{ uid: string; status: string }, [string]>(
					'SELECT uid, status FROM proposals WHERE uid = ?',
				)
				.get('x00999');
			expect(proposal).toEqual({ uid: 'x00999', status: 'ready' });
		} finally {
			driver.close();
		}

		expect(runQuarantineList({ workspaceRoot: root }).total).toBe(1);
	});
});
