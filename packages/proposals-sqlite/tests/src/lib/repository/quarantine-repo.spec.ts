import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QuarantineRepo } from '../../../../src/lib/repository/quarantine-repo';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-quarantine-'));
	return { dir, path: join(dir, 'proposals.sqlite') };
};

describe('QuarantineRepo (q00022 S3 / f00515)', () => {
	let tmpDir: string;
	let dbPath: string;

	beforeEach(() => {
		const tmp = makeTmpPath();
		tmpDir = tmp.dir;
		dbPath = tmp.path;
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it('records pending quarantine rows and lists them by status', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new QuarantineRepo(driver.handle);
			const row = repo.record({
				sourcePath: 'ready/fixes/bad.md',
				blobSha: 'abc123',
				errorCode: 'parse_failed',
				errorMessage: 'missing frontmatter',
				rawMetadata: '{"line":1}',
				now: 100,
			});

			expect(row.status).toBe('pending');
			expect(
				repo.listByStatus('pending').map((entry) => entry.id)
			).toEqual([row.id]);
		} finally {
			driver.close();
		}
	});

	it('resolves a quarantine row with actor and note', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new QuarantineRepo(driver.handle);
			const row = repo.record({
				sourcePath: 'ready/fixes/bad.md',
				blobSha: 'abc123',
				errorCode: 'parse_failed',
				errorMessage: 'missing frontmatter',
				now: 100,
			});
			const resolved = repo.resolve({
				id: row.id,
				status: 'resolved',
				resolvedBy: 'github-copilot',
				resolutionNote: 'fixed upstream',
				now: 200,
			});

			expect(resolved.status).toBe('resolved');
			expect(resolved.resolvedBy).toBe('github-copilot');
			expect(resolved.resolutionNote).toBe('fixed upstream');
			expect(resolved.resolvedAt).toBe(200);
		} finally {
			driver.close();
		}
	});
});
