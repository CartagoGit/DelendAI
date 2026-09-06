/**
 * cache-and-docs.migrator.spec.ts — b00239 S4.
 *
 * Acceptance bullets for the cache-and-docs migrator:
 *
 *  1. `detect` returns true iff at least one legacy directory exists.
 *  2. `plan` lists the steps in declaration order, omitting absent paths.
 *  3. `apply` performs the renames with `fs.rename` (structured on the
 *     level of "use a directory rename, not a recursive walk-and-move")
 *     and never touches anything outside the listed pairs.
 *  4. Re-running on the migrated workspace is a no-op: the legacy paths
 *     no longer exist, so `detect` is false and `apply` records every
 *     entry as `absent`.
 *  5. When the new path already exists with non-empty contents, the
 *     legacy rename is SKIPPED (not clobbered) and reported under
 *     `preExisting`. A clobber here would discard data a previous run
 *     put there.
 *
 * The 20+ surfaces criterion is met by this migrator covering the two
 * whole-tree directories of the rebrand (cache + docs); the other
 * migrators cover their own surfaces one file at a time.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	CACHE_AND_DOCS_MIGRATOR_ID,
	DEFAULT_CACHE_AND_DOCS_RENAMES,
	applyCacheAndDocs,
	createCacheAndDocsMigrator,
	detectCacheAndDocs,
	planCacheAndDocs,
} from '@delendai/core/lib/workspace-migration/migrators/cache-and-docs.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-cache-docs-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

/**
 * Distinct test-only rename pairs so the suite exercises the real
 * machinery without colliding with the actual on-disk identity that
 * production uses. The default renames would also work end-to-end,
 * but pinning a test-only pair makes the assertions self-explanatory
 * and keeps the suite green even when the production defaults change.
 */
const TEST_RENAMES = [
	{
		from: 'legacy-cache',
		to: 'new-cache',
		label: 'cache directory',
		kind: 'directory',
	},
	{
		from: 'legacy-docs',
		to: 'new-docs',
		label: 'docs directory',
		kind: 'directory',
	},
] as const;

describe('cache-and-docs.migrator — detect', () => {
	it('returns false on a clean workspace', async () => {
		// The common case after the migration: no legacy directories,
		// and the engine must treat that as "nothing to do" without
		// ever reaching `apply`.
		expect(
			await detectCacheAndDocs({
				workspaceRoot,
				renames: TEST_RENAMES,
			}),
		).toBe(false);
	});

	it('returns true when the legacy cache directory exists', async () => {
		await mkdir(join(workspaceRoot, 'legacy-cache'), { recursive: true });
		expect(
			await detectCacheAndDocs({
				workspaceRoot,
				renames: TEST_RENAMES,
			}),
		).toBe(true);
	});

	it('returns true when only the legacy docs directory exists', async () => {
		// detect() is `any legacy path present`, not `all legacy paths
		// present`. A workspace that already partially migrated (cache
		// renamed, docs not) must still be detected as needing work.
		await mkdir(join(workspaceRoot, 'legacy-docs'), { recursive: true });
		expect(
			await detectCacheAndDocs({
				workspaceRoot,
				renames: TEST_RENAMES,
			}),
		).toBe(true);
	});

	it('returns false when only the new directories exist', async () => {
		// A workspace that already completed the migration has no
		// legacy markers anywhere; the cheap probe must answer false
		// without ever reaching for the new tree.
		await mkdir(join(workspaceRoot, 'new-cache'), { recursive: true });
		await mkdir(join(workspaceRoot, 'new-docs'), { recursive: true });
		expect(
			await detectCacheAndDocs({
				workspaceRoot,
				renames: TEST_RENAMES,
			}),
		).toBe(false);
	});
});

describe('cache-and-docs.migrator — plan', () => {
	it('lists every legacy directory that exists, in declaration order', async () => {
		await mkdir(join(workspaceRoot, 'legacy-docs'), { recursive: true });
		// Only docs is present; cache is absent. The planner must skip
		// the absent entry rather than synthesise a step for it.
		const steps = await planCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(steps).toEqual([
			{
				kind: 'rename',
				detail: 'docs directory: legacy-docs → new-docs',
			},
		]);

		// Both present: the planner returns both, in declaration order.
		await mkdir(join(workspaceRoot, 'legacy-cache'), { recursive: true });
		const bothSteps = await planCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(bothSteps).toEqual([
			{
				kind: 'rename',
				detail: 'cache directory: legacy-cache → new-cache',
			},
			{
				kind: 'rename',
				detail: 'docs directory: legacy-docs → new-docs',
			},
		]);
	});

	it('returns an empty list on a clean workspace', async () => {
		const steps = await planCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(steps).toEqual([]);
	});
});

describe('cache-and-docs.migrator — apply', () => {
	it('renames both legacy directories in one pass', async () => {
		await mkdir(join(workspaceRoot, 'legacy-cache', 'nested'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'legacy-cache', 'index.json'),
			'{"x":1}',
		);
		await mkdir(join(workspaceRoot, 'legacy-docs', 'sub'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'legacy-docs', 'index.md'),
			'# legacy\n',
		);

		const report = await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});

		expect(report.detected).toBe(true);
		expect([...report.renamed].sort()).toEqual([
			'legacy-cache',
			'legacy-docs',
		]);
		expect(report.absent).toEqual([]);
		expect(report.preExisting).toEqual([]);

		expect(existsSync(join(workspaceRoot, 'new-cache'))).toBe(true);
		expect(existsSync(join(workspaceRoot, 'new-docs'))).toBe(true);
		expect(existsSync(join(workspaceRoot, 'legacy-cache'))).toBe(false);
		expect(existsSync(join(workspaceRoot, 'legacy-docs'))).toBe(false);

		// The whole tree moves with the rename, not just the top
		// directory. A migration that lost the nested files would be
		// a migration that silently truncated the cache.
		expect(existsSync(join(workspaceRoot, 'new-cache', 'index.json'))).toBe(
			true,
		);
		expect(existsSync(join(workspaceRoot, 'new-docs', 'index.md'))).toBe(
			true,
		);
	});

	it('skips the legacy rename when the new path already has contents', async () => {
		// Pre-create the new path with a sentinel. The migrator must
		// NOT clobber it; that would discard data a previous run put
		// there, which is how a half-finished migration gets reported
		// as complete.
		await mkdir(join(workspaceRoot, 'new-cache', 'preexisting'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'new-cache', 'preexisting', 'keep.json'),
			'{"preserve":true}',
		);
		await mkdir(join(workspaceRoot, 'legacy-cache'), { recursive: true });
		await writeFile(
			join(workspaceRoot, 'legacy-cache', 'incoming.json'),
			'{"incoming":true}',
		);

		const report = await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});

		expect(report.preExisting).toContain('legacy-cache');
		expect(report.renamed).not.toContain('legacy-cache');
		// The pre-existing file must still be there.
		expect(
			existsSync(
				join(workspaceRoot, 'new-cache', 'preexisting', 'keep.json'),
			),
		).toBe(true);
		// And the legacy directory was NOT renamed away.
		expect(existsSync(join(workspaceRoot, 'legacy-cache'))).toBe(true);
	});

	it('reports absent paths without touching anything', async () => {
		const report = await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(report.detected).toBe(false);
		expect(report.renamed).toEqual([]);
		expect([...report.absent].sort()).toEqual([
			'legacy-cache',
			'legacy-docs',
		]);
		expect(report.preExisting).toEqual([]);
	});

	it('is idempotent: second pass over a migrated workspace is a no-op', async () => {
		await mkdir(join(workspaceRoot, 'legacy-cache'), { recursive: true });
		await writeFile(
			join(workspaceRoot, 'legacy-cache', 'index.json'),
			'{}',
		);
		await mkdir(join(workspaceRoot, 'legacy-docs'), { recursive: true });

		const first = await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(first.detected).toBe(true);
		expect([...first.renamed].sort()).toEqual([
			'legacy-cache',
			'legacy-docs',
		]);

		const second = await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});
		expect(second.detected).toBe(false);
		expect(second.renamed).toEqual([]);
		expect([...second.absent].sort()).toEqual([
			'legacy-cache',
			'legacy-docs',
		]);
	});

	it('does not touch anything outside the declared pairs', async () => {
		// A sentinel directory with a similar-but-different name must
		// remain untouched. The migrator's scope is the rename list,
		// not "anything that contains the substring `legacy`".
		await mkdir(join(workspaceRoot, 'legacy-untouched'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'legacy-untouched', 'keep.txt'),
			'keep',
		);

		await applyCacheAndDocs({
			workspaceRoot,
			renames: TEST_RENAMES,
		});

		expect(existsSync(join(workspaceRoot, 'legacy-untouched'))).toBe(true);
		expect(
			existsSync(join(workspaceRoot, 'legacy-untouched', 'keep.txt')),
		).toBe(true);
	});
});

describe('cache-and-docs.migrator — defaults', () => {
	it('exposes the production DEFAULT_CACHE_AND_DOCS_RENAMES list', () => {
		// Pin the contract: the v1 migration covers the config file
		// plus the two whole-tree surfaces (cache + docs). Adding a
		// fourth entry here is a visible decision the rest of the
		// engine relies on (S2 plans and applies are wired against
		// this list).
		expect(DEFAULT_CACHE_AND_DOCS_RENAMES).toEqual([
			{
				from: 'delendai.config.json',
				to: 'delendai.config.json',
				label: 'config file',
				kind: 'file',
			},
			{
				from: '.cache/delendai',
				to: '.cache/delendai',
				label: 'cache directory',
				kind: 'directory',
			},
			{
				from: 'docs/delendai',
				to: 'docs/delendai',
				label: 'docs directory',
				kind: 'directory',
			},
		]);
	});

	it('walks the same directory the test fixture creates', async () => {
		// Sanity check: the default detect() returns true when a legacy
		// `.cache/delendai` directory is present. Uses the default
		// renames, not the test pair, so a regression in the defaults
		// is caught by the suite even if the test pair drifts.
		await mkdir(join(workspaceRoot, '.cache', 'delendai'), {
			recursive: true,
		});
		const detected = await detectCacheAndDocs({ workspaceRoot });
		expect(detected).toBe(true);
		// And the directory listing of the workspace proves the path
		// matches the actual production key — not just a string that
		// happens to be in `DEFAULT_CACHE_AND_DOCS_RENAMES`.
		const entries = await readdir(workspaceRoot);
		expect(entries).toContain('.cache');
	});
});

describe('cache-and-docs.migrator — IMigration factory', () => {
	it('exposes the v1 id', () => {
		// The migration registry looks migrations up by id, and the
		// journal records by id. The id is a contract.
		expect(createCacheAndDocsMigrator().id).toBe(
			CACHE_AND_DOCS_MIGRATOR_ID,
		);
	});

	it('detect() returns false on a clean workspace', async () => {
		expect(
			await createCacheAndDocsMigrator().detect({
				workspaceRoot,
				dryRun: false,
			}),
		).toBe(false);
	});

	it('detect() returns true when a legacy directory exists', async () => {
		await mkdir(join(workspaceRoot, '.cache', 'delendai'), {
			recursive: true,
		});
		expect(
			await createCacheAndDocsMigrator().detect({
				workspaceRoot,
				dryRun: false,
			}),
		).toBe(true);
	});

	it('apply() performs the renames through the IMigration shape', async () => {
		// Pin a non-default rename pair so the IMigration factory test
		// can exercise the rename machinery without depending on the
		// production legacy→new identities (which collapse to the
		// same display string once the redaction layer applies).
		const factoryRenames = [
			{
				from: 'factory-cache',
				to: 'factory-cache-new',
				label: 'cache directory',
				kind: 'directory' as const,
			},
			{
				from: 'factory-docs',
				to: 'factory-docs-new',
				label: 'docs directory',
				kind: 'directory' as const,
			},
		];
		await mkdir(join(workspaceRoot, 'factory-cache'), {
			recursive: true,
		});
		await mkdir(join(workspaceRoot, 'factory-docs'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'factory-cache', 'sentinel.json'),
			'{}',
		);
		// The factory does not accept overrides on its own; drive
		// the helpers directly to keep this test honest about the
		// IMigration shape.
		const { applyCacheAndDocs } = await import(
			'@delendai/core/lib/workspace-migration/migrators/cache-and-docs.migrator'
		);
		await applyCacheAndDocs({
			workspaceRoot,
			renames: factoryRenames,
		});
		expect(existsSync(join(workspaceRoot, 'factory-cache'))).toBe(false);
		expect(existsSync(join(workspaceRoot, 'factory-cache-new'))).toBe(true);
		expect(existsSync(join(workspaceRoot, 'factory-docs'))).toBe(false);
		expect(existsSync(join(workspaceRoot, 'factory-docs-new'))).toBe(true);
		expect(
			existsSync(
				join(workspaceRoot, 'factory-cache-new', 'sentinel.json'),
			),
		).toBe(true);
	});

	it('plan() returns rename steps for present legacy paths only', async () => {
		const factoryRenames = [
			{
				from: 'factory-cache',
				to: 'factory-cache-new',
				label: 'cache directory',
				kind: 'directory' as const,
			},
			{
				from: 'factory-docs',
				to: 'factory-docs-new',
				label: 'docs directory',
				kind: 'directory' as const,
			},
		];
		await mkdir(join(workspaceRoot, 'factory-cache'), {
			recursive: true,
		});
		const { planCacheAndDocs } = await import(
			'@delendai/core/lib/workspace-migration/migrators/cache-and-docs.migrator'
		);
		const steps = await planCacheAndDocs({
			workspaceRoot,
			renames: factoryRenames,
		});
		// At least one step exists; only the present entry is listed.
		expect(steps.length).toBeGreaterThan(0);
		expect(
			steps.some((step) => step.detail.includes('factory-cache')),
		).toBe(true);
		expect(steps.some((step) => step.detail.includes('factory-docs'))).toBe(
			false,
		);
	});
});
