import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	QuarantineRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	runQuarantineList,
	quarantineOutputSchema,
} from '../../../../src/lib/tools/quarantine-list.tool';

const makeWorkspace = (): { root: string; dbPath: string } => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-quarantine-list-'));
	return {
		root,
		dbPath: resolveProposalsDbPaths(root).databasePath,
	};
};

describe('runQuarantineList', () => {
	let root: string;
	let dbPath: string;

	beforeEach(() => {
		const workspace = makeWorkspace();
		root = workspace.root;
		dbPath = workspace.dbPath;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns SQLite quarantine entries and distinct run count', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const run = driver.handle
				.prepare(
					`INSERT INTO reconciliation_runs (
						reconciler_version, schema_version, started_at, status
					) VALUES (?, ?, ?, 'degraded')`,
				)
				.run('test', driver.schemaVersion, 100);
			new QuarantineRepo(driver.handle).record({
				sourcePath: 'ready/fixes/bad.md',
				blobSha: 'blob-1',
				errorCode: 'parse_failed',
				errorMessage: 'invalid markdown',
				runId: Number(run.lastInsertRowid),
				now: 100,
			});
		} finally {
			driver.close();
		}

		const output = runQuarantineList({ workspaceRoot: root });
		expect(quarantineOutputSchema.parse(output)).toEqual(output);
		expect(output.total).toBe(1);
		expect(output.runCount).toBe(1);
		expect(output.entries[0]?.sourcePath).toBe('ready/fixes/bad.md');
	});
});
