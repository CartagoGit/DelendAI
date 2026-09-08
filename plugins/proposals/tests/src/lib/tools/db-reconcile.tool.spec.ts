/**
 * db-reconcile.tool.spec.ts — f00534 S1.
 *
 * `bun test`, never vitest: everything here reaches `bun:sqlite`
 * transitively and vitest cannot resolve that module.
 *
 * What is pinned:
 *   1. The CHECK-constraint mirrors in the tool match migration 0001
 *      exactly, read from the SQL itself — the mirror cannot drift.
 *   2. A workspace with no database gets one; an existing one is updated.
 *   3. Idempotency: two runs, one digest, no duplicated rows.
 *   4. Staging failure leaves the active database byte-for-byte intact.
 *   5. Files the projection cannot accept are excluded AND reported.
 */
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	LIFECYCLE_STATUS_VOCABULARY,
	PROPOSAL_KIND_VOCABULARY,
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	DB_RECONCILE_REGISTRATION_ID,
	DB_RECONCILE_TOOL_SUFFIX,
	PROJECTABLE_PROPOSAL_KINDS,
	PROJECTABLE_PROPOSAL_STATUSES,
	buildDbReconcileToolRegistration,
	collectProposalMarkdown,
	preflightProposalFiles,
	proposalsDbReconcileOutputSchema,
	reconcileProposalsDb,
	resolveHeadCommit,
} from '../../../../src/lib/tools/db-reconcile.tool';

const _MIGRATION_0001 = join(
	import.meta.dirname,
	'../../../../../../packages/proposals-sqlite/src/lib/migrations/0001_initial.sql',
);

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeWorkspace = (): { root: string; proposalsDir: string } => {
	const root = mkdtempSync(join(tmpdir(), 'db-reconcile-'));
	roots.push(root);
	const proposalsDir = join(root, 'docs/delendai/proposals');
	mkdirSync(proposalsDir, { recursive: true });
	return { root, proposalsDir };
};

const write = (dir: string, relPath: string, body: string): void => {
	const full = join(dir, relPath);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, body, 'utf8');
};

const flat = (id: string, kind: string, status: string): string =>
	`---\nid: ${id}\ntitle: Fixture ${id}\nkind: ${kind}\nstatus: ${status}\ntype: proposal\ntrack: architecture\n---\n# Fixture ${id}\n\nBody of ${id}.\n`;

const planWithSlices = (id: string, status: string): string =>
	`---\nid: ${id}\ntitle: Plan ${id}\nkind: plan\nstatus: ${status}\ntype: proposal\ntrack: delivery\n---\n# Plan ${id}\n\n## Slices\n\n### S1 — First slice of ${id}\n- **Status**: pending\n- **Gate**: type\n\n### S2 — Second slice of ${id}\n- **Status**: done\n- **Gate**: type\n`;

/** A workspace whose markdown projects cleanly, plus the junk it must reject. */
const seedFixtures = (proposalsDir: string): void => {
	write(
		proposalsDir,
		'ready/feats/q00001-alpha.md',
		flat('q00001', 'feat', 'ready'),
	);
	write(
		proposalsDir,
		'done/fixes/q00002-beta.md',
		flat('q00002', 'fix', 'done'),
	);
	write(
		proposalsDir,
		'ready/plans/q00003-gamma.md',
		planWithSlices('q00003', 'in-progress'),
	);
	// Junk the projection cannot accept — one of each exclusion code.
	write(
		proposalsDir,
		'README.md',
		'# Not a proposal\n\nNo frontmatter here.\n',
	);
	write(
		proposalsDir,
		'ready/q00004-bad-kind.md',
		// `infra` used to be the unprojectable example. x00539 made it
		// canonical (prefix `i`, its own done/infras/ bucket), so the
		// fixture needs a token that is genuinely outside the vocabulary.
		flat('q00004', 'not-a-real-kind', 'ready'),
	);
	write(
		proposalsDir,
		'ready/q00005-bad-status.md',
		flat('q00005', 'feat', 'Accepted'),
	);
};

interface IRow {
	readonly uid: string;
	readonly status: string;
	readonly revision: number;
}

const snapshot = (
	databasePath: string,
): Readonly<Record<string, readonly IRow[]>> => {
	const driver = new ProposalsSqliteDriver({
		path: databasePath,
		readonly: true,
	});
	try {
		return {
			proposals: driver.handle
				.query<IRow, []>(
					'SELECT uid, status, revision FROM proposals ORDER BY uid',
				)
				.all(),
			plans: driver.handle
				.query<IRow, []>(
					'SELECT uid, status, revision FROM plans ORDER BY uid',
				)
				.all(),
			slices: driver.handle
				.query<IRow, []>(
					'SELECT uid, status, revision FROM slices ORDER BY uid',
				)
				.all(),
		};
	} finally {
		driver.close();
	}
};

const sha256File = (path: string): string =>
	createHash('sha256').update(readFileSync(path)).digest('hex');

/** Pull the values of one `<column> IN ( ... )` CHECK list out of the DDL. */
const _checkListFromSql = (sql: string, column: string): readonly string[] => {
	const start = sql.indexOf(`${column} IN (`);
	const open = sql.indexOf('(', start);
	const close = sql.indexOf(')', open);
	return sql
		.slice(open + 1, close)
		.split(',')
		.map((token) => token.trim().replace(/^'|'$/g, ''))
		.filter((token) => token !== '');
};

describe('proposals_db_reconcile — CHECK mirrors (f00534 S1)', () => {
	it('derives both lists from the canonical vocabulary, never a second copy', () => {
		// This used to compare two hand-maintained literal lists against
		// 0001_initial.sql. That is precisely the drift x00539 exists to
		// kill: the pre-flight's private copy is what let `kind: infra`
		// reach a CHECK-constrained column and fail a whole run. The
		// vocabulary module is the single owner now, and it carries its
		// own test pinning it against the EFFECTIVE enum read back out of
		// the migrations (0011 supersedes 0001's CHECK).
		expect([...PROJECTABLE_PROPOSAL_KINDS].sort()).toEqual(
			[...PROPOSAL_KIND_VOCABULARY].sort(),
		);
		expect([...PROJECTABLE_PROPOSAL_STATUSES].sort()).toEqual(
			[...LIFECYCLE_STATUS_VOCABULARY].sort(),
		);
		expect(PROJECTABLE_PROPOSAL_KINDS.has('infra')).toBe(true);
	});
});

describe('proposals_db_reconcile — pre-flight (f00534 S1)', () => {
	it('classifies every unprojectable file and keeps the rest', () => {
		const { proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const files = collectProposalMarkdown(proposalsDir);
		expect(files).toHaveLength(6);

		const preflight = preflightProposalFiles(files, 'test-commit');
		expect(preflight.accepted).toHaveLength(3);
		// All three now arrive as `unparseable`, and that is the new
		// contract rather than a weaker assertion: x00539 moved unknown
		// kind/status handling upstream into the reconciler, which
		// quarantines the offending entity with a reason instead of
		// letting a raw token reach the CHECK. `classifyCandidate` still
		// exists as a second net, but for these two cases it no longer
		// gets the chance to fire — the file never becomes a candidate.
		expect(
			preflight.excluded.map((entry) => [entry.path, entry.code]),
		).toEqual([
			['README.md', 'unparseable'],
			['ready/q00004-bad-kind.md', 'unparseable'],
			['ready/q00005-bad-status.md', 'unparseable'],
		]);
	});

	it('keeps one file per proposal id and reports the duplicates', () => {
		const { proposalsDir } = makeWorkspace();
		write(
			proposalsDir,
			'ready/feats/q00001-alpha.md',
			flat('q00001', 'feat', 'ready'),
		);
		// The same id filed under two lifecycle folders — exactly the
		// shape this repository carries for f00418. `PlanRepo.create` is
		// a plain INSERT, so without this the staging transaction dies
		// with `UNIQUE constraint failed: plans.uid`.
		write(
			proposalsDir,
			'review/q00001-alpha.md',
			planWithSlices('q00001', 'review'),
		);

		const preflight = preflightProposalFiles(
			collectProposalMarkdown(proposalsDir),
			'test-commit',
		);
		expect(preflight.accepted).toHaveLength(1);
		expect(preflight.excluded).toHaveLength(1);
		expect(preflight.excluded[0]?.code).toBe('duplicate_id');
		expect(preflight.excluded[0]?.message).toContain('q00001');
	});

	it('picks the same duplicate winner whatever order the files arrive in', () => {
		const files = [
			{ path: 'a/q00001.md', raw: flat('q00001', 'feat', 'ready') },
			{ path: 'b/q00001.md', raw: flat('q00001', 'feat', 'done') },
		];
		const forward = preflightProposalFiles(files, 'c');
		const reversed = preflightProposalFiles([...files].reverse(), 'c');
		expect(forward.excluded.map((e) => e.path)).toEqual(
			reversed.excluded.map((e) => e.path),
		);
	});

	it('reads .md recursively with workspace-relative, sorted paths', () => {
		const { proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		write(proposalsDir, 'notes.txt', 'ignored');
		const paths = collectProposalMarkdown(proposalsDir).map((f) => f.path);
		expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
		expect(paths.some((p) => p.endsWith('.txt'))).toBe(false);
		expect(paths).toContain('ready/plans/q00003-gamma.md');
	});
});

describe('proposals_db_reconcile — the database starts existing (f00534 S1)', () => {
	it('creates the database at the canonical path and returns all three counters', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);
		expect(existsSync(paths.databasePath)).toBe(false);

		const out = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_000_000,
		});

		expect(proposalsDbReconcileOutputSchema.parse(out)).toBeTruthy();
		expect(out.status).toBe('ok');
		expect(out.reason).toBeNull();
		expect(out.created).toBe(true);
		expect(out.databasePath).toBe(paths.databasePath);
		expect(existsSync(paths.databasePath)).toBe(true);
		expect(out.sourceCommit).toBe('commit-one');
		expect(out.logicalDigest).toMatch(/^[0-9a-f]{64}$/);
		expect(out.filesScanned).toBe(6);
		expect(out.filesReconciled).toBe(3);
		expect(out.proposals).toBe(3);
		expect(out.plans).toBe(1);
		expect(out.slices).toBe(2);
		expect(out.excludedCount).toBe(3);
		expect(out.integrity).toBe('ok');
		expect(out.foreignKey).toBe('ok');

		const rows = snapshot(paths.databasePath);
		expect(rows.proposals?.map((r) => r.uid)).toEqual([
			'q00001',
			'q00002',
			'q00003',
		]);
		expect(rows.plans?.map((r) => r.uid)).toEqual(['q00003']);
		expect(rows.slices?.map((r) => r.uid)).toEqual([
			'q00003.S1',
			'q00003.S2',
		]);
		// The staging database is not left behind after a promotion.
		expect(existsSync(paths.stagingPath)).toBe(false);
	});

	it('is idempotent: same digest, same row count, no duplicates', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);

		const first = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_000_000,
		});
		const second = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_001_000,
		});

		expect(second.status).toBe('ok');
		expect(second.created).toBe(false);
		expect(second.logicalDigest).toBe(first.logicalDigest);
		expect(second.proposals).toBe(first.proposals);
		expect(second.plans).toBe(first.plans);
		expect(second.slices).toBe(first.slices);

		const rows = snapshot(paths.databasePath);
		expect(rows.proposals).toHaveLength(3);
		expect(rows.plans).toHaveLength(1);
		expect(rows.slices).toHaveLength(2);
		// Second pass updates in place: revision advanced, rows did not.
		expect(rows.proposals?.every((r) => r.revision === 1)).toBe(true);
	});

	it('updates an existing database when the markdown changes', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);
		reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_000_000,
		});

		write(
			proposalsDir,
			'ready/feats/q00001-alpha.md',
			flat('q00001', 'feat', 'done'),
		);
		write(
			proposalsDir,
			'ready/feats/q00006-delta.md',
			flat('q00006', 'chore', 'ready'),
		);

		const out = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-two',
			now: 1_760_000_002_000,
		});

		expect(out.status).toBe('ok');
		expect(out.created).toBe(false);
		expect(out.proposals).toBe(4);
		const rows = snapshot(paths.databasePath);
		expect(rows.proposals?.find((r) => r.uid === 'q00001')?.status).toBe(
			'done',
		);
		expect(rows.proposals?.map((r) => r.uid)).toContain('q00006');
	});

	it('dryRun validates without creating the active database', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);

		const out = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			dryRun: true,
			now: 1_760_000_000_000,
		});

		expect(out.status).toBe('ok');
		expect(out.dryRun).toBe(true);
		expect(out.logicalDigest).toMatch(/^[0-9a-f]{64}$/);
		expect(existsSync(paths.databasePath)).toBe(false);
		expect(existsSync(paths.stagingPath)).toBe(false);
	});
});

describe('proposals_db_reconcile — failure leaves the active DB alone (f00534 S1)', () => {
	it('returns the reason and does not touch the active database when staging fails', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);

		const good = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_000_000,
		});
		expect(good.status).toBe('ok');
		const bytesBefore = sha256File(paths.databasePath);
		const rowsBefore = snapshot(paths.databasePath);

		// Break the staging build itself, through the seam the sqlite
		// package documents for exactly this.
		const out = reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-two',
			now: 1_760_000_003_000,
			driver: {
				apply: () => {
					throw new Error('injected migration failure');
				},
			},
		});

		expect(out.status).toBe('rejected');
		expect(out.reason).toContain('injected migration failure');
		expect(out.proposals).toBe(0);
		expect(sha256File(paths.databasePath)).toBe(bytesBefore);
		expect(snapshot(paths.databasePath)).toEqual(rowsBefore);
	});

	it('leaves the active database untouched when the promotion digest does not match', () => {
		const { root, proposalsDir } = makeWorkspace();
		seedFixtures(proposalsDir);
		const paths = resolveProposalsDbPaths(root);
		reconcileProposalsDb({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			sourceCommit: 'commit-one',
			now: 1_760_000_000_000,
		});
		const bytesBefore = sha256File(paths.databasePath);
		const rowsBefore = snapshot(paths.databasePath);

		const staged = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: root,
			sourceCommit: 'commit-three',
			sha: 'commit-three',
			files: preflightProposalFiles(
				collectProposalMarkdown(proposalsDir),
				'commit-three',
			).accepted,
			now: 1_760_000_004_000,
		});
		const applied = applyValidatedCandidate({
			stagingPath: staged.stagingPath,
			activePath: paths.databasePath,
			sourceCommit: 'commit-three',
			expectedDigest: 'deadbeef'.repeat(8),
			now: 1_760_000_004_000,
		});

		expect(applied.status).toBe('rejected');
		expect(applied.reason).toContain('logical digest');
		expect(sha256File(paths.databasePath)).toBe(bytesBefore);
		expect(snapshot(paths.databasePath)).toEqual(rowsBefore);
	});
});

describe('proposals_db_reconcile — registration shape (f00534 S1)', () => {
	it('exposes a stable id and namespaced wire name', async () => {
		const { root, proposalsDir } = makeWorkspace();
		const registration = buildDbReconcileToolRegistration({
			workspaceRoot: root,
			proposalsDirAbs: proposalsDir,
			namespacePrefix: 'work',
		});
		expect(registration.id).toBe(DB_RECONCILE_REGISTRATION_ID);
		expect(DB_RECONCILE_TOOL_SUFFIX).toBe('db_reconcile');

		const names: string[] = [];
		await registration.register({
			registerTool: (name: string) => {
				names.push(name);
			},
		} as never);
		expect(names).toEqual(['work_db_reconcile']);
	});

	it('resolves HEAD from git plumbing and degrades to "workspace" without a repo', () => {
		const { root } = makeWorkspace();
		expect(resolveHeadCommit(root)).toBe('workspace');
		mkdirSync(join(root, '.git/refs/heads'), { recursive: true });
		writeFileSync(join(root, '.git/HEAD'), 'ref: refs/heads/develop\n');
		writeFileSync(
			join(root, '.git/refs/heads/develop'),
			`${'a'.repeat(40)}\n`,
		);
		expect(resolveHeadCommit(root)).toBe('a'.repeat(40));
	});
});
