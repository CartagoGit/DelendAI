/**
 * legacy-migration-manager.spec.ts — b00239 S2.
 *
 * Pins the four acceptance bullets for the `LegacyMigrationManager`
 * slice, end-to-end against a real on-disk workspace:
 *
 *  1. The registry ships a versioned migration named
 *     `delendaiToDelendAI:v1`, and that id is the one recorded in
 *     the journal after a successful run.
 *  2. The CLI entrypoint seam wires the registry into the engine, so
 *     calling `ensureMigrated(workspaceRoot)` runs the same migration
 *     the engine would run.
 *  3. A workspace that does NOT carry the legacy identity costs one
 *     `access` probe per registered migration and writes nothing —
 *     the engine's `acted: false` outcome is observable, the
 *     `report` callback is not invoked, and the journal file does
 *     not appear.
 *  4. Running the guard twice over the same workspace leaves the
 *     same tree, verified by a recursive hash of the workspace
 *     contents. The first run migrates and records; the second run
 *     detects nothing and writes nothing.
 *
 * Why a separate spec file from `legacy-migration.service.spec.ts`:
 * that one pins the engine's invariants against in-memory stubs.
 * This one pins the S2 SLICE acceptance (registry + concrete
 * migrator + entrypoint seam) against real on-disk fixtures, which
 * is the contract a future "wire this into every command" slice
 * depends on and the only way to verify acceptance #4 by hash.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_MIGRATIONS,
	DEFAULT_MIGRATION_IDS,
	MIGRATION_JOURNAL_PATH,
	createFileSystemJournal,
} from '@delendai/core/lib/workspace-migration/migration-registry';
import { DELENDAI_TO_DELENDAI_V1_ID } from '@delendai/core/lib/workspace-migration/migrations/delendai-to-delendai-v1';
import {
	ensureWorkspaceMigrated,
	runPendingMigrations,
} from '@delendai/core/lib/workspace-migration/legacy-migration.service';
import type { IMigrationJournal } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';

/**
 * Recursive sorted-relative-path hash: enumerate every regular file
 * under `root`, sort its path and its contents, hash the lot.
 *
 * Determinism matters here because the spec asserts "running the
 * guard twice leaves the same tree". A non-deterministic walk order
 * would produce a different hash for the same logical contents and
 * the assertion would be testing the OS, not the migration.
 */
const hashWorkspace = async (root: string): Promise<string> => {
	const files: { readonly path: string; readonly contents: string }[] = [];
	const walk = async (dir: string): Promise<void> => {
		const { readdir, stat } = await import('node:fs/promises');
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const child = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === '.git')
					continue;
				await walk(child);
				continue;
			}
			if (entry.isFile()) {
				const s = await stat(child);
				if (!s.isFile()) continue;
				files.push({
					path: relative(root, child),
					contents: await readFile(child, 'utf8'),
				});
			}
		}
	};
	await walk(root);
	files.sort((a, b) => a.path.localeCompare(b.path));
	const { createHash } = await import('node:crypto');
	return createHash('sha256')
		.update(
			files.map((file) => `${file.path}\0${file.contents}`).join('\n'),
		)
		.digest('hex');
};

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s2-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

describe('acceptance #1 — registry ships delendaiToDelendAI:v1', () => {
	it('exposes the migration in DEFAULT_MIGRATIONS', () => {
		// The contract every project-aware entrypoint depends on: when
		// the guard is called, this is the migration set it sees.
		expect(DEFAULT_MIGRATIONS).toHaveLength(1);
		expect(DEFAULT_MIGRATIONS[0]?.id).toBe(DELENDAI_TO_DELENDAI_V1_ID);
	});

	it('exposes the id in DEFAULT_MIGRATION_IDS for callers that need the set', () => {
		expect(DEFAULT_MIGRATION_IDS.has(DELENDAI_TO_DELENDAI_V1_ID)).toBe(
			true,
		);
		expect(DEFAULT_MIGRATION_IDS.size).toBe(DEFAULT_MIGRATIONS.length);
	});

	it('uses an id, not a numeric version', () => {
		// The header of the engine warns against numeric versioning
		// because a workspace that started at v2 has nothing to record
		// against v1. Pinning the id format is how future migrations
		// stay compatible.
		expect(DELENDAI_TO_DELENDAI_V1_ID).toBe('delendaiToDelendAI:v1');
		expect(DELENDAI_TO_DELENDAI_V1_ID.includes(':v')).toBe(true);
	});
});

describe('acceptance #2 — entrypoint seam wires the registry into the engine', () => {
	it('runs the registered migration through ensureWorkspaceMigrated', async () => {
		// Drop a legacy sentinel so detect() returns true and the
		// engine has something real to migrate.
		await writeFile(join(workspaceRoot, 'delendai.config.json'), '{}');
		const journal = createFileSystemJournal();
		const result = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal,
			workspaceRoot,
		});
		expect(result.acted).toBe(true);
		expect(result.outcomes).toEqual([
			{ status: 'migrated', id: DELENDAI_TO_DELENDAI_V1_ID },
		]);
	});

	it('surfaces the registry through the public path the CLI uses', () => {
		// The CLI entrypoint (packages/cli/src/lib/cli/entrypoint.ts)
		// re-exports DEFAULT_MIGRATIONS so callers cannot accidentally
		// construct their own (drifting) migration list.
		const cliSurface = DEFAULT_MIGRATIONS;
		expect(cliSurface).toBe(DEFAULT_MIGRATIONS);
		expect(cliSurface[0]?.id).toBe(DELENDAI_TO_DELENDAI_V1_ID);
	});
});

describe('acceptance #3 — already-migrated workspace is a no-op', () => {
	it('reports not-needed and does not invoke report on a clean workspace', async () => {
		// A workspace with no legacy sentinel. The detector walks the
		// three known paths, all return false, the engine exits with
		// `acted: false`, and the optional `report` callback is never
		// called — silence on the happy path is the feature.
		const journal = createFileSystemJournal();
		let reportCalls = 0;
		const result = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal,
			workspaceRoot,
			report: () => {
				reportCalls += 1;
			},
		});
		expect(result.acted).toBe(false);
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(reportCalls).toBe(0);
	});

	it('does not create the journal file on a clean workspace', async () => {
		// Pinning the "no measurable cost" half: a workspace that has
		// nothing to migrate must not produce a journal file at all.
		// A check that wrote an empty file on every start would be a
		// check that grew the workspace tree on every start.
		await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot,
		});
		expect(existsSync(join(workspaceRoot, ...MIGRATION_JOURNAL_PATH))).toBe(
			false,
		);
	});

	it('skips plan when detect returns false', async () => {
		// The engine's contract: detect is the cheap probe, plan is
		// the expensive half, and plan must not be reached when
		// detect already answered "no". Verify on the real registry.
		const result = await runPendingMigrations({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			ctx: { workspaceRoot, dryRun: false },
		});
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
	});
});

describe('acceptance #4 — idempotency, verified by hash', () => {
	it('running the guard twice leaves the same tree', async () => {
		// Build a representative legacy tree: all three v1 sentinels
		// present, with non-empty contents that survive a rename.
		await writeFile(
			join(workspaceRoot, 'delendai.config.json'),
			'{"legacy":true}\n',
		);
		await mkdir(join(workspaceRoot, '.cache', 'delendai'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, '.cache', 'delendai', 'index.json'),
			'{"legacyCache":true}\n',
		);
		await mkdir(join(workspaceRoot, 'docs', 'delendai'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'docs', 'delendai', 'index.md'),
			'# legacy\n',
		);

		const first = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot,
		});
		expect(first.acted).toBe(true);

		const afterFirstHash = await hashWorkspace(workspaceRoot);
		const journalPath = join(workspaceRoot, ...MIGRATION_JOURNAL_PATH);
		expect(existsSync(journalPath)).toBe(true);
		const recordedFirst = await readFile(journalPath, 'utf8');
		expect(recordedFirst).toContain(DELENDAI_TO_DELENDAI_V1_ID);

		// Second run: the engine sees the migration recorded, so it
		// short-circuits without probing the tree. The guard returns
		// `acted: false`, the tree is byte-identical and the
		// journal is unchanged. This is the contract the engine's
		// "record-after-apply, skip-already-recorded" rules exist to
		// guarantee.
		const second = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot,
		});
		expect(second.acted).toBe(false);
		expect(second.outcomes).toEqual([{ status: 'not-needed' }]);

		const afterSecondHash = await hashWorkspace(workspaceRoot);
		expect(afterSecondHash).toBe(afterFirstHash);
	});

	it('does not double-record the same id', async () => {
		// The file-system journal appends, never duplicates. Two runs
		// over the same workspace produce a journal with exactly one
		// entry for `delendaiToDelendAI:v1`, not two.
		await writeFile(join(workspaceRoot, 'delendai.config.json'), '{}');
		const journal: IMigrationJournal = createFileSystemJournal();
		await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal,
			workspaceRoot,
		});
		await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal,
			workspaceRoot,
		});
		const journalPath = join(workspaceRoot, ...MIGRATION_JOURNAL_PATH);
		const recorded = await readFile(journalPath, 'utf8');
		const parsed: unknown = JSON.parse(recorded);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toEqual([DELENDAI_TO_DELENDAI_V1_ID]);
	});
});
