/**
 * cache-and-docs.migrator.ts — b00239 S4.
 *
 * The directory-rename migrator. Owns the three path renames the
 * proposal's "Public contracts affected" list enumerates as
 * items 3, 4 and 5:
 *
 *  - `<workspaceRoot>/delendai.config.json` → `delendai.config.json`
 *  - `<workspaceRoot>/.cache/delendai` → `.cache/delendai`
 *  - `<workspaceRoot>/docs/delendai` → `docs/delendai`
 *
 * After the top-level rename, the migrator recurses one level into
 * each renamed directory and in-place rewrites any file whose
 * format a sibling migrator owns (`delendai.config.json`,
 * `package.json`). Files the sibling migrators do not recognise
 * pass through untouched — moving them is this migrator's job;
 * parsing them is someone else's.
 *
 * ## Why a dedicated migrator, not a one-line `fs.rename`
 *
 * A `renameSync(from, to)` would do the path move but would leave
 * the contents carrying the old identity, and the S2 stub
 * migrator's `plan` would still report the directory as
 * "needs-rename" forever. A purpose-built migrator that moves AND
 * walks its contents makes the post-migration state one
 * `detect()` call away from "everything is fine".
 *
 * ## Why this is the ONLY migrator that does tree renames
 *
 * Other migrators operate file-by-file. This one is the only one
 * allowed to do `fs.rename` across directories, because cache and
 * docs are the only "whole tree" surfaces — everything else is one
 * file at a time and is the other migrators' job. Concentrating the
 * tree-rename code in one place is what makes the rest of the system
 * safe to reason about: a reviewer of any other migrator can assume
 * it touches only the files in its slice.
 *
 * ## Idempotency
 *
 * Each `access` is gated by "from exists" + "to does not exist (or
 * is empty)". A re-run over a tree that was already migrated does
 * nothing because `from` no longer exists. A re-run over a tree
 * that was half-migrated (e.g. crash mid-rename) finishes the work
 * because `from` still exists and `to` is empty.
 */
import { access, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import { createConfigFileMigrator } from './config-file.migrator';
import { createPackageManifestMigrator } from './package-manifest.migrator';

/** Stable id recorded in the journal. NOT a number, by design. */
export const CACHE_AND_DOCS_MIGRATOR_ID = 'cacheAndDocsMigrator:v1';

/** Whether the rename is for a single file or a whole directory. */
export type ICacheAndDocsKind = 'file' | 'directory';

/** One rename pair: a legacy on-disk identity and its replacement. */
export interface ICacheAndDocsRename {
	readonly from: string;
	readonly to: string;
	readonly label: string;
	readonly kind: ICacheAndDocsKind;
}

/**
 * The three production renames. Held as a frozen array so the
 * detector, the planner and the applier walk the same list — the
 * asymmetry a rename lives or dies by (a migrator that detects
 * one spelling but renames another reports itself complete while
 * leaving the workspace half-converted).
 */
export const DEFAULT_CACHE_AND_DOCS_RENAMES: readonly ICacheAndDocsRename[] = [
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
] as const;

export interface ICacheAndDocsOptions {
	readonly workspaceRoot: string;
	/**
	 * Override the rename list. Production uses
	 * `DEFAULT_CACHE_AND_DOCS_RENAMES`; tests pass their own pair so
	 * the migration can be observed end-to-end without colliding
	 * with the real on-disk paths.
	 */
	readonly renames?: readonly ICacheAndDocsRename[];
	/** When true, plan but do not write. */
	readonly dryRun?: boolean;
}

export interface ICacheAndDocsReport {
	readonly detected: boolean;
	readonly steps: readonly IMigrationPlanStep[];
	/** Paths that were renamed (or would be, in dry-run). */
	readonly renamed: readonly string[];
	/** Paths where the new name already existed with non-empty contents. */
	readonly preExisting: readonly string[];
	/** Legacy paths that did not exist on disk — there was nothing to move. */
	readonly absent: readonly string[];
}

/** A path exists iff `access` resolves. One stat call, no surprises. */
const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

/**
 * Cheap probe: does any legacy path exist? Returns as soon as it
 * finds one, because the engine treats "anything legacy on disk"
 * as the answer; ordering is not a dependency statement between
 * these three surfaces.
 */
export const detectCacheAndDocs = async (
	options: ICacheAndDocsOptions,
): Promise<boolean> => {
	const renames = options.renames ?? DEFAULT_CACHE_AND_DOCS_RENAMES;
	for (const { from } of renames) {
		if (await pathExists(join(options.workspaceRoot, from))) return true;
	}
	return false;
};

/** What `apply` would do. Used by dry-run and by the migration manifest. */
export const planCacheAndDocs = async (
	options: ICacheAndDocsOptions,
): Promise<readonly IMigrationPlanStep[]> => {
	const renames = options.renames ?? DEFAULT_CACHE_AND_DOCS_RENAMES;
	const steps: IMigrationPlanStep[] = [];
	for (const { from, to, label } of renames) {
		if (await pathExists(join(options.workspaceRoot, from))) {
			steps.push({
				kind: 'rename',
				detail: `${label}: ${from} → ${to}`,
			});
		}
	}
	return steps;
};

/**
 * Recurse one level into a renamed directory and rewrite any file
 * whose name a sibling migrator recognises. Unknown formats pass
 * through untouched — moving bytes is the migrator's job; parsing
 * them is the sibling migrator's.
 *
 * The recursion is shallow on purpose: package manifests and config
 * files do not nest, and the cache/docs directories do not contain
 * `.github/agents/`. Anything deeper is content that the file's own
 * migrator (or the residual scanner in S8) will own.
 */
const rewriteInside = async (absoluteDir: string): Promise<number> => {
	const configMigrator = createConfigFileMigrator();
	const packageMigrator = createPackageManifestMigrator();
	let rewrites = 0;

	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(absoluteDir, { withFileTypes: true });
	} catch {
		return rewrites;
	}

	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (entry.name === 'delendai.config.json') {
			await configMigrator.apply({
				workspaceRoot: join(absoluteDir, entry.name),
				dryRun: false,
			});
			rewrites += 1;
			continue;
		}
		if (entry.name === 'package.json') {
			await packageMigrator.apply({
				workspaceRoot: join(absoluteDir, entry.name),
				dryRun: false,
			});
			rewrites += 1;
		}
	}
	return rewrites;
};

/**
 * Apply the renames in declaration order. Each rename is reported
 * individually — partial success (e.g. cache migrated, docs missing)
 * is the common case after the transition, not a failure.
 *
 * The rename is skipped (not failed) when:
 *  - the legacy path is absent (nothing to move), or
 *  - the new path already exists with non-empty contents (clobbering
 *    a populated new tree would discard data a previous run put there).
 *
 * The rename is folded (rename-after-rm) when the new path is an
 * empty directory, because that signals a half-finished migration
 * from a different run; surfacing it is what lets the rollback story
 * (S6) distinguish "first time" from "redo".
 */
export const applyCacheAndDocs = async (
	options: ICacheAndDocsOptions,
): Promise<ICacheAndDocsReport> => {
	const renames = options.renames ?? DEFAULT_CACHE_AND_DOCS_RENAMES;
	const detected = await detectCacheAndDocs(options);
	const steps = await planCacheAndDocs(options);
	const renamed: string[] = [];
	const preExisting: string[] = [];
	const absent: string[] = [];

	if (options.dryRun) {
		for (const { from } of renames) {
			if (await pathExists(join(options.workspaceRoot, from))) {
				renamed.push(from);
			} else {
				absent.push(from);
			}
		}
		return { detected, steps, renamed, preExisting, absent };
	}

	for (const { from, to, kind } of renames) {
		const legacyAbsolute = join(options.workspaceRoot, from);
		const newAbsolute = join(options.workspaceRoot, to);
		if (!(await pathExists(legacyAbsolute))) {
			absent.push(from);
			continue;
		}
		if (await pathExists(newAbsolute)) {
			// Fold only when the destination is an EMPTY directory;
			// otherwise we are about to clobber real data.
			try {
				const destStat = await stat(newAbsolute);
				if (destStat.isDirectory()) {
					const destEntries = await readdir(newAbsolute);
					if (destEntries.length === 0) {
						await rm(newAbsolute, {
							recursive: true,
							force: true,
						});
						await rename(legacyAbsolute, newAbsolute);
						renamed.push(from);
						if (kind === 'directory') {
							await rewriteInside(newAbsolute);
						}
						continue;
					}
				}
			} catch {
				// stat failed: leave the rename skipped.
			}
			preExisting.push(from);
			continue;
		}
		await rename(legacyAbsolute, newAbsolute);
		renamed.push(from);
		if (kind === 'directory') {
			await rewriteInside(newAbsolute);
		}
	}

	return { detected, steps, renamed, preExisting, absent };
};

/**
 * Factory: a fresh migrator instance conforming to `IMigration`.
 * Pure at import time, side-effect free until `apply` is called.
 *
 * The engine sees this migrator as a regular IMigration: its
 * `detect` is the cheap probe, its `plan` returns rename steps,
 * its `apply` walks the renamed trees. The factory shape is what
 * keeps the rest of the migrators safe to reason about — every
 * other one operates file-by-file, this one is the only place a
 * directory rename happens.
 */
export const createCacheAndDocsMigrator = (): IMigration => {
	return {
		id: CACHE_AND_DOCS_MIGRATOR_ID,

		detect: async (ctx) =>
			detectCacheAndDocs({ workspaceRoot: ctx.workspaceRoot }),

		plan: async (ctx) =>
			planCacheAndDocs({ workspaceRoot: ctx.workspaceRoot }),

		apply: async (ctx) => {
			await applyCacheAndDocs({ workspaceRoot: ctx.workspaceRoot });
		},
	};
};
