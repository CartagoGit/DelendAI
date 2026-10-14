/**
 * registry-export.service.spec.ts — q00022 S4 (phase 1): the registry
 * derived from the database is the registry the markdown scan writes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'bun:test';

import { reconcileIncremental } from '@delendai/proposals-sqlite';

import {
	exportRegistryFromDb,
	registryEntriesFromRows,
} from '../../../../src/lib/proposals/registry-export.service';
import { scanProposalRegistry } from '../../../../src/lib/proposals/sync-proposal-registry';
import { collectProposalMarkdown } from '../../../../src/lib/tools/db-reconcile.tool';

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..');
const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('registryEntriesFromRows', () => {
	it('builds each entry as the registry lists it: defaults, flattened extras, archived', () => {
		const result = registryEntriesFromRows([
			{
				source_path: 'ready/fixes/x00901-a-fix.md',
				frontmatter_json: JSON.stringify({
					status: 'ready',
					ownership: ['plugins/proposals/**'],
				}),
			},
			{
				source_path: 'legacy/closed/feats/f00001-old.md',
				frontmatter_json: JSON.stringify({
					id: 'f00001',
					status: 'done',
					kind: 'feat',
					track: 'web',
					type: 'proposal',
					date: '2026-06-01',
				}),
			},
		]);

		expect(result.errors).toEqual([]);
		expect(result.entries).toEqual([
			{
				id: 'x00901-a-fix',
				file: 'ready/fixes/x00901-a-fix.md',
				track: 'unspecified',
				type: 'unspecified',
				kind: 'fix',
				status: 'ready',
				date: 'unknown',
				ownership: ['plugins/proposals/**'],
			},
			{
				id: 'f00001',
				file: 'legacy/closed/feats/f00001-old.md',
				track: 'web',
				type: 'proposal',
				kind: 'feat',
				status: 'done',
				date: '2026-06-01',
				archived: true,
			},
		]);
	});

	it('reports a row without its frontmatter, and one whose status is not one, and skips a row without a path', () => {
		const result = registryEntriesFromRows([
			{ source_path: 'ready/fixes/x00902-a.md', frontmatter_json: null },
			{
				source_path: 'ready/fixes/x00903-b.md',
				frontmatter_json: JSON.stringify({ status: 'someday' }),
			},
			{ source_path: null, frontmatter_json: '{}' },
		]);

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			'ready/fixes/x00902-a.md: projected without its frontmatter; reconcile to fill it',
			"x00903-b.md: invalid 'status' frontmatter value 'someday'",
		]);
	});
});

describe('the registry exported from the database', () => {
	it('is the registry the markdown scan writes, for every proposal of this repository', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'registry-export-'));
		dirs.push(dir);
		const databasePath = join(dir, 'proposals.sqlite');
		reconcileIncremental({
			databasePath,
			sourceCommit: 'registry-export-parity',
			files: collectProposalMarkdown(
				join(REPO_ROOT, 'docs/delendai/proposals'),
			),
		});

		const exported = await exportRegistryFromDb(databasePath);
		const scanned = (await scanProposalRegistry(REPO_ROOT)).index;

		const keyOf = (entry: object): string =>
			`${'id' in entry ? String(entry.id) : ''}|${'file' in entry ? String(entry.file) : ''}`;
		const byKey = <T extends object>(entries: readonly T[]): T[] =>
			[...entries].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
		expect(exported?.errors).toEqual([]);
		expect(exported?.entries.length).toBeGreaterThan(900);
		expect(JSON.stringify(byKey(exported?.entries ?? []))).toBe(
			JSON.stringify(byKey(scanned.proposals)),
		);
	});

	it('is null when there is no database to read', async () => {
		expect(
			await exportRegistryFromDb('/nonexistent/proposals.sqlite'),
		).toBeNull();
	});
});
