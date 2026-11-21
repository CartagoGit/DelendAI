import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
	ProposalsSqliteDriver,
} from '../../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-quarantine-reconcile-'));

describe('reconcile quarantine integration', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = makeTmpDir();
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('records corrupt files with the reconciliation run id', () => {
		const result = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: rootDir,
			sourceCommit: 'commit-corrupt',
			sha: 'tree-corrupt',
			files: [
				{
					path: 'ready/fixes/corrupt.md',
					sha: 'blob-corrupt',
					raw: 'this is not a proposal document',
				},
			],
			now: 100,
		});

		expect(result.status).toBe('degraded');
		expect(result.quarantinedEntries).toBe(1);

		const paths = resolveProposalsDbPaths(rootDir);
		const driver = new ProposalsSqliteDriver({
			path: result.stagingPath,
			readonly: true,
		});
		try {
			const quarantine = driver.handle
				.query<{ run_id: number; source_path: string }, []>(
					'SELECT run_id, source_path FROM quarantine',
				)
				.get();
			const run = driver.handle
				.query<
					{ id: number; status: string; source_commit: string },
					[]
				>('SELECT id, status, source_commit FROM reconciliation_runs')
				.get();

			expect(quarantine).toEqual({
				run_id: run?.id,
				source_path: 'ready/fixes/corrupt.md',
			});
			expect(run).toEqual({
				id: quarantine?.run_id,
				status: 'degraded',
				source_commit: 'commit-corrupt',
			});
			expect(paths.stagingPath).toBe(result.stagingPath);
		} finally {
			driver.close();
		}
	});
});
