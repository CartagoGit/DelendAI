/**
 * migration-registry.ts — b00239 S2.
 *
 * The default registry: the ordered list of migrations a workspace
 * will be asked to run, and the journal implementation that records
 * what has already been done.
 *
 * ## Why a registry at all
 *
 * The engine in `legacy-migration.service.ts` is intentionally
 * headless: it accepts a `readonly IMigration[]` and an
 * `IMigrationJournal`, and runs them in declaration order. Without a
 * registry every caller has to invent the same list, which is how
 * two callers drift apart on what counts as "the migration set" and
 * one of them skips a step. The registry is the single answer to
 * "what migrations exist for this runtime?".
 *
 * ## Adding a future migration
 *
 * Append it to `DEFAULT_MIGRATIONS`. Do not rename or remove existing
 * entries: the journal records by id, and a renamed entry looks like
 * a brand-new migration that runs over a workspace that already did
 * the equivalent work — the failure mode the engine's
 * "record-after-apply" rule exists to prevent.
 *
 * ## Why the journal lives at `.delendai/migrations-applied.json`
 *
 * Two reasons. First, it has to be OUTSIDE `.cache/delendai/` because
 * the `v1` migrator renames that directory; if the journal moved with
 * the cache, a record written after a successful rename would land in
 * the new path, which is fine for one workspace but obscures the
 * intent. Second, `.delendai/` is the canonical hidden home for
 * runtime-owned workspace state — `.delendai/` is already gitignored
 * and reserved for delendai-internal artefacts that should never end
 * up in version control.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	IMigration,
	IMigrationId,
	IMigrationJournal,
} from '../contracts/interfaces/workspace-migration.interface';

import {
	DELENDAI_TO_DELENDAI_V1_ID,
	delendaiToDelendAIV1,
} from './migrations/delendai-to-delendai-v1';

/**
 * The migrations a workspace runs, in declaration order.
 *
 * Ordered by declaration because declaration IS the dependency
 * statement. An alphabetical or "by date" accident is not a
 * dependency statement; the engine does not sort and never will.
 */
export const DEFAULT_MIGRATIONS: readonly IMigration[] = [
	delendaiToDelendAIV1,
] as const;

/** The migrations this registry currently ships, as a frozen map. */
export const DEFAULT_MIGRATION_IDS: ReadonlySet<IMigrationId> = new Set(
	DEFAULT_MIGRATIONS.map((migration) => migration.id),
);

/** Where the runtime records what has already been applied to a workspace. */
export const MIGRATION_JOURNAL_PATH = [
	'.delendai',
	'migrations-applied.json',
] as const;

const journalAbsolutePath = (workspaceRoot: string): string =>
	join(workspaceRoot, ...MIGRATION_JOURNAL_PATH);

/**
 * Read the journal as a list of ids. Missing file → empty list (a
 * workspace that has never been migrated has nothing recorded).
 * Anything else (a corrupt file, an array with non-strings) is
 * surfaced as the empty list too: the engine will then run every
 * pending migration's `detect` against the real workspace, and the
 * detector is the authoritative answer to "is there legacy here?",
 * not the journal.
 */
const readJournalFromDisk = async (
	workspaceRoot: string,
): Promise<readonly IMigrationId[]> => {
	try {
		const raw = await readFile(journalAbsolutePath(workspaceRoot), 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(value): value is string => typeof value === 'string',
		);
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code: unknown }).code === 'ENOENT'
		) {
			return [];
		}
		throw error;
	}
};

const writeJournalToDisk = async (
	workspaceRoot: string,
	ids: readonly IMigrationId[],
): Promise<void> => {
	const absolute = journalAbsolutePath(workspaceRoot);
	await mkdir(dirname(absolute), { recursive: true });
	await writeFile(absolute, `${JSON.stringify(ids, null, '\t')}\n`, 'utf8');
};

/**
 * The default journal for real workspaces: a small JSON file under
 * `.delendai/` recording the list of migration ids that have run.
 *
 * A fresh instance is created per call so multiple workspaces (or a
 * test and the runtime) cannot leak state through a shared cache.
 * The engine already calls `read` once at the start of a run and
 * `record` only after a successful `apply`, so the lack of in-memory
 * caching cannot cause a migration to be applied twice.
 */
export const createFileSystemJournal = (): IMigrationJournal => ({
	read: async (workspaceRoot) => readJournalFromDisk(workspaceRoot),

	record: async (workspaceRoot, id) => {
		const current = await readJournalFromDisk(workspaceRoot);
		if (current.includes(id)) return;
		const next = readonlyAppend(current, id);
		await writeJournalToDisk(workspaceRoot, next);
	},
});

const readonlyAppend = <T>(list: readonly T[], value: T): readonly T[] => {
	const copy = list.slice();
	copy.push(value);
	return copy;
};

export { DELENDAI_TO_DELENDAI_V1_ID };
