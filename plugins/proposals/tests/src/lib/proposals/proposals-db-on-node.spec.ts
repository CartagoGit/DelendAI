/**
 * proposals-db-on-node.spec.ts — the proposals database opens, migrates,
 * reconciles and serves the registry under Node (`node:sqlite`), not only
 * under Bun. This spec runs in vitest, on Node.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	PROPOSALS_SQLITE_SCHEMA_VERSION,
	ProposalsSqliteDriver,
	reconcileIncremental,
} from '@delendai/proposals-sqlite';

import { exportRegistryFromDb } from '../../../../src/lib/proposals/registry-export.service';
import { scanProposalRegistry } from '../../../../src/lib/proposals/sync-proposal-registry';
import { collectProposalMarkdown } from '../../../../src/lib/tools/db-reconcile.tool';

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const freshDatabasePath = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-node-'));
	dirs.push(dir);
	return join(dir, 'proposals.sqlite');
};

describe('the proposals database on Node', () => {
	it('runs on Node here, where bun:sqlite does not exist', () => {
		expect(process.versions.bun).toBeUndefined();
	});

	it('applies every migration to a fresh database', () => {
		const driver = new ProposalsSqliteDriver({ path: freshDatabasePath() });
		try {
			expect(driver.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			driver.close();
		}
	});

	it('reconciles this repository and exports the registry the scan writes', async () => {
		const databasePath = freshDatabasePath();
		const result = reconcileIncremental({
			databasePath,
			sourceCommit: 'node-runtime',
			files: collectProposalMarkdown(
				join(REPO_ROOT, 'docs/delendai/proposals'),
			),
		});
		expect(result.proposalsCreated).toBeGreaterThan(900);

		const exported = await exportRegistryFromDb(databasePath);
		const scanned = (await scanProposalRegistry(REPO_ROOT)).index;
		const keyOf = (entry: object): string =>
			`${'id' in entry ? String(entry.id) : ''}|${'file' in entry ? String(entry.file) : ''}`;
		const byKey = <T extends object>(entries: readonly T[]): T[] =>
			[...entries].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));

		expect(exported?.errors).toEqual([]);
		expect(JSON.stringify(byKey(exported?.entries ?? []))).toBe(
			JSON.stringify(byKey(scanned.proposals)),
		);
	});
});
