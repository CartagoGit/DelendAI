import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	LifecycleRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	runResurrectTool,
	resurrectOutputSchema,
} from '../../../../src/lib/tools/resurrect.tool';

describe('runResurrectTool', () => {
	let root: string;

	beforeEach(() => {
		mkdirSync(join(process.cwd(), '.delendai/state/exec'), {
			recursive: true,
		});
		root = mkdtempSync(
			join(process.cwd(), '.delendai/state/exec/proposals-resurrect-'),
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('resurrects only the requested tombstone and records an audit event', () => {
		const databasePath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: databasePath });
		try {
			const insert = driver.handle.prepare(
				`INSERT INTO proposals (
					uid, slug, kind, status, title, revision,
					created_at, updated_at, deleted_at, tombstone_reason
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);
			insert.run(
				'f00999',
				'example',
				'fix',
				'done',
				'Example',
				2,
				100,
				100,
				200,
				'missing_source',
			);
			insert.run(
				'f00998',
				'other',
				'fix',
				'done',
				'Other',
				4,
				100,
				100,
				200,
				'missing_source',
			);
		} finally {
			driver.close();
		}

		const output = runResurrectTool(
			{ workspaceRoot: root },
			{ uid: 'f00999', note: 'restore after source recovery' },
		);
		expect(resurrectOutputSchema.parse(output)).toEqual(output);
		expect(output).toMatchObject({
			uid: 'f00999',
			entityType: 'proposal',
			revision: 3,
		});

		const verify = new ProposalsSqliteDriver({ path: databasePath });
		try {
			const restored = verify.handle
				.query<
					{ deleted_at: number | null; revision: number },
					[string]
				>('SELECT deleted_at, revision FROM proposals WHERE uid = ?')
				.get('f00999');
			const untouched = verify.handle
				.query<{ deleted_at: number | null }, [string]>(
					'SELECT deleted_at FROM proposals WHERE uid = ?',
				)
				.get('f00998');
			expect(restored).toEqual({ deleted_at: null, revision: 3 });
			expect(untouched?.deleted_at).toBe(200);
			const events = new LifecycleRepo(verify.handle).listForEntity({
				entityType: 'proposal',
				entityUid: 'f00999',
			});
			expect(events.at(-1)).toMatchObject({
				toStatus: 'entity_resurrected',
				metadata: JSON.stringify({
					note: 'restore after source recovery',
				}),
			});
		} finally {
			verify.close();
		}
	});
});
