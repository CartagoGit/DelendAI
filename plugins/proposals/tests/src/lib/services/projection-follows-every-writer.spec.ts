/**
 * projection-follows-every-writer.spec.ts
 *
 * `bun test`, never vitest (bun:sqlite).
 *
 * Seven tools change proposals — transition, create, close, adopt and
 * others — and every one of them rebuilt the registry while only the
 * sync tool and one repository's commit hook rebuilt the database. So a
 * transition made over MCP left the reader falling back to JSON until
 * the next commit; in a project without that hook, until someone ran
 * the sync by hand.
 *
 * This drives the real thing: a real repository, the real reconciler,
 * the real reader. A transition — not a sync — must leave the database
 * level with the registry, carrying the new status.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import { projectionParity } from '../../../../src/lib/proposals/index-reader-parity';
import { readProposalIndexResultFromSql } from '../../../../src/lib/proposals/index-reader-sql';
import { runProposalTransition } from '../../../../src/lib/tools/proposal-transition.tool';
import { runSyncProposals } from '../../../../src/lib/tools/sync-proposals.tool';

const PROPOSALS_DIR = 'docs/delendai/proposals';
const INDEX_FILE = '.cache/delendai/proposals/index.json';
const ID = 'x99621';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repository = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'projection-writers-'));
	roots.push(root);
	const inProgress = join(root, PROPOSALS_DIR, 'in-progress');
	mkdirSync(inProgress, { recursive: true });
	mkdirSync(join(root, PROPOSALS_DIR, 'review'), { recursive: true });
	writeFileSync(
		join(inProgress, `${ID}-a-transition-reaches-the-database.md`),
		[
			'---',
			`id: ${ID}`,
			'title: "A transition reaches the database"',
			'kind: fix',
			'status: in-progress',
			'type: proposal',
			'track: trust',
			'date: 2026-09-23',
			'---',
			'',
			`# ${ID} — A transition reaches the database`,
			'',
			'## goal',
			'',
			'Be moved, and be seen moved by every reader.',
			'',
			'## Slices',
			'',
			'### S1 — The only slice',
			'',
			'- **Status**: done',
			'- **Gate**: none',
			`- **Files**: \`${PROPOSALS_DIR}/review/${ID}.md\``,
			'',
		].join('\n'),
		'utf8',
	);
	writeFileSync(join(root, PROPOSALS_DIR, 'review', '.gitkeep'), '', 'utf8');
	const git = (args: readonly string[]): void => {
		execFileSync('git', [...args], { cwd: root, stdio: 'ignore' });
	};
	git(['init', '-q', '-b', 'main']);
	git(['config', 'user.email', 'spec@example.test']);
	git(['config', 'user.name', 'Spec']);
	git(['add', '-A']);
	git(['commit', '-q', '-m', 'one proposal in progress']);
	return root;
};

const statusInDatabase = async (root: string): Promise<string | undefined> => {
	const { databasePath } = resolveProposalsDbPaths(root);
	const result = await readProposalIndexResultFromSql({ databasePath });
	return result?.entries.find((entry) => entry.id === ID)?.status;
};

describe('the database follows every writer, not only the sync tool', () => {
	it('is level after a sync, and a second sync leaves it alone', async () => {
		const root = repository();
		const layout = {
			proposalsDir: PROPOSALS_DIR,
			proposalIndexFile: INDEX_FILE,
		};
		const first = await runSyncProposals({
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			layout,
		});
		expect(first.projection).toBe('refreshed');
		expect(
			await projectionParity(join(root, INDEX_FILE), {
				workspaceRoot: root,
			}),
		).toBe('parity');

		const second = await runSyncProposals({
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			layout,
		});
		expect(second.projection).toBe('skipped');
	});

	it('carries a transition into the database without anyone running a sync', async () => {
		const root = repository();
		await runSyncProposals({
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			layout: {
				proposalsDir: PROPOSALS_DIR,
				proposalIndexFile: INDEX_FILE,
			},
		});
		expect(await statusInDatabase(root)).toBe('in-progress');

		const moved = await runProposalTransition(
			{ id: ID, to: 'review', reason: 'the only slice is done' },
			{
				namespacePrefix: 'proposals',
				workspaceRoot: root,
				proposalsDirAbs: join(root, PROPOSALS_DIR),
				indexPathAbs: join(root, INDEX_FILE),
				requirePeerReview: false,
				requireValidateEvidence: false,
			},
		);
		expect(JSON.stringify(moved)).not.toContain('"isError":true');

		// The reader would serve the database, and the database has the move.
		expect(
			await projectionParity(join(root, INDEX_FILE), {
				workspaceRoot: root,
			}),
		).toBe('parity');
		expect(await statusInDatabase(root)).toBe('review');
	});
});
