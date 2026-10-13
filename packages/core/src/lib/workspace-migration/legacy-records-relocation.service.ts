/**
 * legacy-records-relocation.service.ts — an older delendai's `.delendai/` folder is
 * moved into the cache directory's records folder at start.
 *
 * Runs before the migration journal is read, because the journal is one
 * of the files it moves: read first, the journal would look empty and
 * every migration would be asked again. Only delendai's own records move:
 * `.delendai/` also holds what the project writes itself (workspace skills
 * in `skills/`, knowledge packs in `knowledge/`), and moving those into an
 * ignored cache took them from the project. Each record is renamed into
 * place; one the records folder already has is left where it was and
 * reported, never overwritten. `state/` is not moved here: the state
 * directory migrator owns where the state database goes. The old folder
 * is removed once nothing but its own ignore file is left.
 */
import { readdir, rename, rm, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
	CACHE_EVICTION_STAMP_PATH,
	CACHE_LAYOUT_MARKER_PATH,
} from '../contracts/constants/cache-layout.constant';
import { APPLIED_CONFIG_FILE } from '../contracts/constants/config-transition.constant';
import {
	LEGACY_RECORDS_DIR,
	PROJECT_PROFILE_RECORD,
} from '../contracts/constants/delendai-records.constant';
import { ensureRecordsDir } from '../shared/delendai-records';
import { MIGRATION_JOURNAL_FILE } from './migration-journal-path.constant';
import { MIGRATION_MANIFESTS_DIR } from './transaction/migration-manifest';
import { BACKUP_SNAPSHOTS_DIR } from './transaction/rollback';

/** What an older delendai wrote in `.delendai/`, by the name it gave it. */
const LEGACY_RECORDS: ReadonlySet<string> = new Set([
	MIGRATION_JOURNAL_FILE,
	APPLIED_CONFIG_FILE,
	PROJECT_PROFILE_RECORD,
	CACHE_LAYOUT_MARKER_PATH.at(-1) ?? '',
	CACHE_EVICTION_STAMP_PATH.at(-1) ?? '',
	MIGRATION_MANIFESTS_DIR.at(-1) ?? '',
	BACKUP_SNAPSHOTS_DIR.at(-1) ?? '',
	// The commit driver's lock (`plugins/commit-policy`).
	'index-lock',
]);

const exists = (path: string): Promise<boolean> =>
	stat(path).then(
		() => true,
		() => false,
	);

/** What moving the old folder did: the entries moved, and the ones left because the new place had them. */
export const relocateLegacyRecords = async (
	workspaceRoot: string,
): Promise<{
	readonly moved: readonly string[];
	readonly kept: readonly string[];
}> => {
	const legacy = join(workspaceRoot, LEGACY_RECORDS_DIR);
	const entries = await readdir(legacy).catch(() => undefined);
	if (entries === undefined) return { moved: [], kept: [] };
	const records = ensureRecordsDir(workspaceRoot);
	const moved: string[] = [];
	const kept: string[] = [];
	for (const name of entries) {
		if (!LEGACY_RECORDS.has(name)) continue;
		const target = join(records, name);
		if (await exists(target)) {
			kept.push(name);
			continue;
		}
		await rename(join(legacy, name), target);
		moved.push(name);
	}
	await removeLegacyFolderIfSpent(workspaceRoot);
	return { moved, kept };
};

/** Removes `.delendai/` once only its ignore file is left in it. */
export const removeLegacyFolderIfSpent = async (
	workspaceRoot: string,
): Promise<void> => {
	const legacy = join(workspaceRoot, LEGACY_RECORDS_DIR);
	const left = await readdir(legacy).catch(() => undefined);
	if (left === undefined || left.some((name) => name !== '.gitignore'))
		return;
	await rm(join(legacy, '.gitignore'), { force: true });
	await rmdir(legacy).catch(() => undefined);
};
