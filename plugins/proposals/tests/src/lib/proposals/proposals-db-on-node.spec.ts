/**
 * proposals-db-on-node.spec.ts — the proposals database opens, migrates,
 * reconciles and serves the registry under Node (`node:sqlite`), not only
 * under Bun. This spec runs in vitest, on Node.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	PROPOSALS_SQLITE_SCHEMA_VERSION,
	ProposalsSqliteDriver,
} from '@delendai/proposals-sqlite';

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
	it('[<200ms] runs on Node here, where bun:sqlite does not exist', () => {
		expect(process.versions.bun).toBeUndefined();
	});

	it('[<200ms] applies every migration to a fresh database', () => {
		const driver = new ProposalsSqliteDriver({ path: freshDatabasePath() });
		try {
			expect(driver.schemaVersion).toBe(PROPOSALS_SQLITE_SCHEMA_VERSION);
		} finally {
			driver.close();
		}
	});
});
