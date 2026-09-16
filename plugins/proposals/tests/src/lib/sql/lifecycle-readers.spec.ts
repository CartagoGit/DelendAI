/**
 * lifecycle-readers.spec.ts — the lifecycle readers against a REAL
 * proposals database.
 *
 * This spec runs under `bun test` (see the `test:sqlite` script), not
 * vitest: the readers open `bun:sqlite`, a Bun builtin with no node
 * resolution. Everything here is the half that a mocked handle cannot
 * prove — that the queries match the migrated schema, that a row written
 * by the real repos is found again by uid and by every path spelling a
 * caller might hold, and that an absent or empty database answers rather
 * than throws.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
	ProposalRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	buildSqlLifecycleReaders,
	buildSqlPathCandidates,
} from '@delendai/proposals/lib/sql/lifecycle-readers';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'lifecycle-readers-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
		recursive: true,
	});
	return root;
};

const RELATIVE_PATH = 'ready/feats/f00547-a-proposal.md';

/** A migrated database with one proposal row in it. */
const seedProposal = (
	root: string,
	overrides: Readonly<Record<string, unknown>> = {},
): void => {
	// Opening writable runs the migrations, so this is also the only
	// place the real schema gets built.
	const driver = new ProposalsSqliteDriver({
		path: resolveProposalsDbPaths(root).databasePath,
	});
	try {
		new ProposalRepo(driver.handle).upsertProjection({
			uid: 'f00547',
			slug: 'f00547-a-proposal',
			path: RELATIVE_PATH,
			title: 'A proposal',
			kind: 'feat',
			status: 'ready',
			type: 'proposal',
			track: 'general',
			bodyHash: 'seed-hash',
			...overrides,
		} as never);
	} finally {
		driver.close();
	}
};

describe('buildSqlPathCandidates', () => {
	it('offers the absolute, workspace-relative and proposals-relative spellings', () => {
		const root = '/ws';
		const candidates = buildSqlPathCandidates(
			root,
			'/ws/docs/delendai/proposals/ready/feats/f00547-a-proposal.md',
		);

		expect(candidates).toContain(
			'/ws/docs/delendai/proposals/ready/feats/f00547-a-proposal.md',
		);
		expect(candidates).toContain(
			'docs/delendai/proposals/ready/feats/f00547-a-proposal.md',
		);
		expect(candidates).toContain(RELATIVE_PATH);
	});

	it('has nothing to offer for an absent path', () => {
		expect(buildSqlPathCandidates('/ws', undefined)).toEqual([]);
		expect(buildSqlPathCandidates('/ws', '')).toEqual([]);
	});

	it('keeps a path outside the workspace as itself', () => {
		const candidates = buildSqlPathCandidates('/ws', '/elsewhere/other.md');

		expect(candidates).toContain('/elsewhere/other.md');
		// `../elsewhere/other.md` would be a lookup key no writer ever used.
		expect(candidates.some((each) => each.startsWith('../'))).toBe(false);
	});
});

describe('the lifecycle readers with no database at all', () => {
	it('count answers zeroes', async () => {
		const readers = buildSqlLifecycleReaders(makeWorkspace());

		expect(await readers.count()).toEqual({
			proposals: 0,
			plans: 0,
			slices: 0,
		});
	});

	it('every state lookup answers null', async () => {
		const readers = buildSqlLifecycleReaders(makeWorkspace());

		expect(
			await readers.getProposalState({ proposalId: 'f00547' }),
		).toBeNull();
		expect(await readers.getPlanState({ planId: 'q00034' })).toBeNull();
		expect(
			await readers.getSliceState({
				proposalId: 'f00547',
				sliceId: 's1',
			}),
		).toBeNull();
	});

	it('lastSync reports no reconcile has ever completed', async () => {
		const readers = buildSqlLifecycleReaders(makeWorkspace());

		expect(await readers.lastSync()).toEqual({
			at: undefined,
			sourceCommit: undefined,
		});
	});
});

describe('the lifecycle readers against a migrated database', () => {
	it('counts the rows that are really there', async () => {
		const root = makeWorkspace();
		seedProposal(root);

		const counted = await buildSqlLifecycleReaders(root).count();

		expect(counted.proposals).toBe(1);
		expect(counted.plans).toBe(0);
		expect(counted.slices).toBe(0);
	});

	it('finds a proposal by its uid, with the status the row carries', async () => {
		const root = makeWorkspace();
		seedProposal(root);

		const state = await buildSqlLifecycleReaders(root).getProposalState({
			proposalId: 'f00547',
		});

		expect(state).not.toBeNull();
		expect(state?.status).toBe('ready');
		expect(state?.sourcePath).toBe(RELATIVE_PATH);
	});

	it('finds the same proposal by the path spellings a caller might hold', async () => {
		const root = makeWorkspace();
		seedProposal(root);
		const readers = buildSqlLifecycleReaders(root);

		for (const path of [
			join(root, 'docs/delendai/proposals', RELATIVE_PATH),
			join('docs/delendai/proposals', RELATIVE_PATH),
			RELATIVE_PATH,
		]) {
			const state = await readers.getProposalState({
				proposalId: 'f00547',
				path,
			});
			expect(state?.status).toBe('ready');
		}
	});

	it('answers null for a proposal the database does not hold', async () => {
		const root = makeWorkspace();
		seedProposal(root);

		expect(
			await buildSqlLifecycleReaders(root).getProposalState({
				proposalId: 'f99999',
			}),
		).toBeNull();
	});

	it('reads a database that is migrated but empty without inventing rows', async () => {
		const root = makeWorkspace();
		// Open and close writable: migrations run, no rows are written.
		new ProposalsSqliteDriver({
			path: resolveProposalsDbPaths(root).databasePath,
		}).close();

		const readers = buildSqlLifecycleReaders(root);

		expect(await readers.count()).toEqual({
			proposals: 0,
			plans: 0,
			slices: 0,
		});
		expect(await readers.lastSync()).toEqual({
			at: undefined,
			sourceCommit: undefined,
		});
		expect(
			await readers.getProposalState({ proposalId: 'f00547' }),
		).toBeNull();
	});
});
