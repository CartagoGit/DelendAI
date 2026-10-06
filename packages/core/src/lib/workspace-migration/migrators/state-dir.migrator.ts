/**
 * state-dir.migrator.ts — the state an older delendai kept at
 * `.delendai/state/` is moved to `.cache/delendai/state/`, where the
 * current one reads it, and the emptied directory goes.
 *
 * The databases there are regenerable projections, so they moved under
 * the cache; nothing performed the move for a project that upgraded. A
 * database left at the old place made the tools that own it refuse to
 * start, with a manual `mv` as the remedy, and the directory stayed after
 * somebody did it by hand.
 *
 * Nothing is overwritten: a file already at the new place is kept, and
 * the old one stays where it is and is reported.
 */
import { access, mkdir, readdir, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import {
	LEGACY_STATE_SEGMENTS,
	SQLITE_SIDECAR_SUFFIXES,
	STATE_SEGMENTS,
} from './state-dir.constant';

export const STATE_DIR_MIGRATOR_ID = 'stateDirectoryMigrator:v1';

const exists = async (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/** The files of the legacy directory, sidecars before the files they serve. */
const legacyFiles = async (legacyDir: string): Promise<string[]> => {
	if (!(await exists(legacyDir))) return [];
	const entries = await readdir(legacyDir, { withFileTypes: true });
	const files = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const isSidecar = (name: string): boolean =>
		SQLITE_SIDECAR_SUFFIXES.some((suffix) => name.endsWith(suffix));
	return [
		...files.filter(isSidecar),
		...files.filter((name) => !isSidecar(name)),
	];
};

const dirsOf = (ctx: IMigrationContext) => ({
	legacyDir: join(ctx.workspaceRoot, ...LEGACY_STATE_SEGMENTS),
	currentDir: join(ctx.workspaceRoot, ...STATE_SEGMENTS),
});

const stepsFor = async (
	ctx: IMigrationContext,
): Promise<IMigrationPlanStep[]> => {
	const { legacyDir, currentDir } = dirsOf(ctx);
	const steps: IMigrationPlanStep[] = [];
	for (const file of await legacyFiles(legacyDir)) {
		steps.push(
			(await exists(join(currentDir, file)))
				? {
						kind: 'conflict',
						detail: `${file} is in both ${legacyDir} and ${currentDir}; the current one is kept and the legacy one is left for a person to compare`,
					}
				: {
						kind: 'move',
						detail: `${file}: ${legacyDir} → ${currentDir}`,
					},
		);
	}
	return steps;
};

export const createStateDirMigrator = (): IMigration => ({
	id: STATE_DIR_MIGRATOR_ID,
	detect: async (ctx) =>
		(await legacyFiles(dirsOf(ctx).legacyDir)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		const { legacyDir, currentDir } = dirsOf(ctx);
		const files = await legacyFiles(legacyDir);
		if (files.length === 0) return;
		await mkdir(currentDir, { recursive: true });
		for (const file of files) {
			if (await exists(join(currentDir, file))) continue;
			await rename(join(legacyDir, file), join(currentDir, file));
		}
		// The directory goes only if nothing is left in it.
		if ((await readdir(legacyDir)).length === 0) await rmdir(legacyDir);
	},
});
