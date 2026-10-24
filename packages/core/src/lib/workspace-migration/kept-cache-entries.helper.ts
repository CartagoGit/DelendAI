/**
 * kept-cache-entries.helper.ts — what a cache move left where it was.
 *
 * The move never overwrites: an entry the destination already holds stays
 * in the source, and the destination's copy is kept. Each such entry is a
 * `kept` step, so the start-up report names it instead of keeping it in
 * silence.
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { IMigrationPlanStep } from '../contracts/interfaces/workspace-migration.interface';

/** One `kept` step per file still under `fromAbs` after the move. */
export const keptCacheEntries = async (
	fromAbs: string,
	fromDir: string,
	toDir: string,
): Promise<readonly IMigrationPlanStep[]> => {
	const stayed = await readdir(fromAbs, {
		recursive: true,
		withFileTypes: true,
	})
		.then((entries) =>
			entries
				.filter((entry) => entry.isFile())
				.map((entry) =>
					relative(fromAbs, join(entry.parentPath, entry.name)),
				),
		)
		.catch(() => [] as string[]);
	return stayed.map((entry) => ({
		kind: 'kept',
		detail: `${join(fromDir, entry)} stayed: ${join(toDir, entry)} was already there, and is kept`,
	}));
};
