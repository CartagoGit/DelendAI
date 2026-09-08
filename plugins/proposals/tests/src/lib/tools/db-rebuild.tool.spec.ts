import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver } from '@delendai/proposals-sqlite';
import {
	rebuildProposalsDb,
	dbRebuildPaths,
} from '../../../../src/lib/services/db-rebuild';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const workspace = (): { root: string; proposals: string } => {
	const root = mkdtempSync(join(tmpdir(), 'db-rebuild-'));
	const proposals = join(root, 'docs/delendai/proposals');
	mkdirSync(proposals, { recursive: true });
	writeFileSync(
		join(proposals, 'q00001.md'),
		'---\nid: q00001\ntitle: Rebuild fixture\nkind: feat\nstatus: ready\ntype: proposal\ntrack: test\n---\n# Rebuild fixture\n',
	);
	roots.push(root);
	return { root, proposals };
};

describe('rebuildProposalsDb', () => {
	it('previews without changing the active database', () => {
		const fixture = workspace();
		const result = rebuildProposalsDb({
			workspaceRoot: fixture.root,
			proposalsDirAbs: fixture.proposals,
			sourceCommit: 'sha-preview',
		});
		expect(result.applied).toBe(false);
		expect(result.proposedSha).toBe('sha-preview');
		expect(result.confirmationRequired).toBe(false);
		expect(result.status).toBe('ok');
		expect(result.created).toBe(true);
		expect(existsSync(dbRebuildPaths(fixture.root).databasePath)).toBe(false);
	});

	it('requires the proposed SHA before applying', () => {
		const fixture = workspace();
		const result = rebuildProposalsDb({
			workspaceRoot: fixture.root,
			proposalsDirAbs: fixture.proposals,
			apply: true,
			sourceCommit: 'sha-confirm',
		});
		expect(result.applied).toBe(false);
		expect(result.confirmationRequired).toBe(true);
		expect(result.proposedSha).toBe('sha-confirm');
		expect(result.status).toBe('ok');
		expect(result.reason).toBeNull();
	});

	it('applies with matching SHA and emits an idempotent outbox event', () => {
		const fixture = workspace();
		const first = rebuildProposalsDb({
			workspaceRoot: fixture.root,
			proposalsDirAbs: fixture.proposals,
			apply: true,
			confirm: 'sha-apply',
			sourceCommit: 'sha-apply',
			now: 1_000,
		});
		expect(first.status).toBe('ok');
		expect(first.applied).toBe(true);
		const paths = dbRebuildPaths(fixture.root);
		const driver = new ProposalsSqliteDriver({ path: paths.databasePath });
		try {
			const outbox = driver.handle
				.query<{ count: number }, []>(
					"SELECT COUNT(*) AS count FROM outbox WHERE kind = 'proposals-db-rebuilt'",
				)
				.get();
			expect(outbox?.count).toBe(1);
		} finally {
			driver.close();
		}
		const second = rebuildProposalsDb({
			workspaceRoot: fixture.root,
			proposalsDirAbs: fixture.proposals,
			apply: true,
			confirm: 'sha-apply',
			sourceCommit: 'sha-apply',
			now: 2_000,
		});
		expect(second.status).toBe('ok');
		const after = new ProposalsSqliteDriver({ path: paths.databasePath });
		try {
			const outbox = after.handle
				.query<{ count: number }, []>(
					"SELECT COUNT(*) AS count FROM outbox WHERE kind = 'proposals-db-rebuilt'",
				)
				.get();
			expect(outbox?.count).toBe(1);
		} finally {
			after.close();
		}
	});
});