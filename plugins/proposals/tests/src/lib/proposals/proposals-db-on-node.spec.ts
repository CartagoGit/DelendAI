/**
 * proposals-db-on-node.spec.ts — the proposals database opens, migrates,
 * reconciles and serves the registry under Node (`node:sqlite`), not only
 * under Bun. This spec runs in vitest, on Node.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	PROPOSALS_SQLITE_SCHEMA_VERSION,
	ProposalsSqliteDriver,
	reconcileIncremental,
} from '@delendai/proposals-sqlite';

import { exportRegistryFromDb } from '../../../../src/lib/proposals/registry-export.service';
import { scanProposalRegistry } from '../../../../src/lib/proposals/sync-proposal-registry';
import { collectProposalMarkdown } from '../../../../src/lib/tools/db-reconcile.tool';

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A small proposals tree under a temporary root: the same layout the
 * repository uses (`docs/delendai/proposals/<status>/...`), so the scan and
 * the reconcile read it exactly as they read the real one, in milliseconds.
 */
const fixtureRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-node-root-'));
	dirs.push(root);
	const proposals = join(root, 'docs/delendai/proposals');
	const write = (folder: string, id: string, status: string): void => {
		mkdirSync(join(proposals, folder), { recursive: true });
		writeFileSync(
			join(proposals, folder, `${id}-fixture-proposal.md`),
			[
				'---',
				`id: ${id}`,
				`title: "Fixture proposal ${id}"`,
				'kind: chore',
				`status: ${status}`,
				'type: proposal',
				'track: general',
				'date: 2026-11-01',
				'---',
				'',
				`# ${id} — Fixture proposal ${id}`,
				'',
				'## goal',
				'',
				'A fixture.',
				'',
				'## slices',
				'',
				'- global_gate: none',
				'',
				'### S1 — The fixture slice',
				`- **Status**: ${status === 'done' ? 'done' : 'pending'}`,
				'- **Files**: `package.json`',
				'- **Gate**: none',
				'- acceptance:',
				'  - "The fixture holds."',
				'',
				'## acceptance',
				'',
				'- The fixture holds.',
				'',
			].join('\n'),
		);
	};
	write('done/chores', 'c90001', 'done');
	write('done/chores', 'c90002', 'done');
	write('in-progress', 'c90003', 'in-progress');
	write('ready', 'c90004', 'ready');
	return root;
};

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

	it('reconciles a fixture proposals tree and exports the registry the scan writes', async () => {
		const databasePath = freshDatabasePath();
		const root = fixtureRoot();
		const result = reconcileIncremental({
			databasePath,
			sourceCommit: 'node-runtime',
			files: collectProposalMarkdown(
				join(root, 'docs/delendai/proposals'),
			),
		});
		expect(result.proposalsCreated).toBe(4);

		const exported = await exportRegistryFromDb(databasePath);
		const scanned = (await scanProposalRegistry(root)).index;
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
