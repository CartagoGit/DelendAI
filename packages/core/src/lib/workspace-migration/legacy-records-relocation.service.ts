/**
 * legacy-records-relocation.service.ts — an older delendai's `.delendai/` folder is
 * moved into the cache directory's records folder at start.
 *
 * Runs before the migration journal is read, because the journal is one
 * of the files it moves: read first, the journal would look empty and
 * every migration would be asked again. Each entry is renamed into place;
 * an entry the records folder already has is left where it was and
 * reported, never overwritten. `state/` is not moved here: the state
 * directory migrator owns where the state database goes. The old folder
 * is removed once nothing but its own ignore file is left.
 */
import { readdir, rename, rm, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { LEGACY_RECORDS_DIR } from '../contracts/constants/delendai-records.constant';
import { ensureRecordsDir } from '../shared/delendai-records';

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
		if (name === '.gitignore' || name === 'state') continue;
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
