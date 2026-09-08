import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	ProposalRepo,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import { summaryBackfill } from '@delendai/proposals-sqlite';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('summary backfill', () => {
	it('writes one summary per content hash and is idempotent', async () => {
		const root = mkdtempSync(join(tmpdir(), 'summary-backfill-'));
		roots.push(root);
		const driver = new ProposalsSqliteDriver({
			path: resolveProposalsDbPaths(root).databasePath,
		});
		try {
			new ProposalRepo(driver.handle).upsertProjection({
				uid: 'f00001',
				slug: 'f00001-summary',
				kind: 'feat',
				status: 'ready',
				title: 'Summary fixture',
				type: 'proposal',
				track: 'architecture',
				path: 'ready/feats/f00001-summary.md',
				bodyHash: 'hash-1',
			});
			const summarize = (proposal: { title: string }) => `Summary: ${proposal.title}`;
			const first = await summaryBackfill(driver.handle, {
				summaryModel: 'test',
				summaryPromptVersion: 'v1',
				summarize,
				now: 10,
			});
			const second = await summaryBackfill(driver.handle, {
				summaryModel: 'test',
				summaryPromptVersion: 'v1',
				summarize,
				now: 11,
			});
			expect(first).toEqual({ considered: 1, created: 1, skipped: 0 });
			expect(second).toEqual({ considered: 0, created: 0, skipped: 0 });
			expect(
				driver.handle
					.query<{ summary: string }, []>('SELECT summary FROM summary_cache')
					.get()?.summary,
			).toBe('Summary: Summary fixture');
		} finally {
			driver.close();
		}
	});
});