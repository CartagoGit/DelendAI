import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	runTombstonesTool,
	tombstonesOutputSchema,
} from '../../../../src/lib/tools/tombstones.tool';

describe('runTombstonesTool', () => {
	let root: string;

	beforeEach(() => {
		mkdirSync(join(process.cwd(), '.delendai/state/exec'), {
			recursive: true,
		});
		root = mkdtempSync(
			join(process.cwd(), '.delendai/state/exec/proposals-tombstones-'),
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('lists tombstones without changing the database', () => {
		const databasePath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: databasePath });
		try {
			driver.handle
				.prepare(
					`INSERT INTO proposals (
						uid, slug, kind, status, title, revision,
						created_at, updated_at, deleted_at, last_seen_at,
						last_seen_commit, tombstone_reason
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'f00999',
					'example',
					'fix',
					'done',
					'Example',
					2,
					100,
					100,
					200,
					150,
					'abc123',
					'missing_source',
				);
		} finally {
			driver.close();
		}

		const before = runTombstonesTool({ workspaceRoot: root });
		const after = runTombstonesTool({ workspaceRoot: root });
		expect(tombstonesOutputSchema.parse(before)).toEqual(before);
		expect(before).toEqual(after);
		expect(before.total).toBe(1);
		expect(before.entries[0]).toMatchObject({
			uid: 'f00999',
			kind: 'fix',
			deletedAt: 200,
			lastSeenCommit: 'abc123',
			reason: 'missing_source',
		});
	});
});
