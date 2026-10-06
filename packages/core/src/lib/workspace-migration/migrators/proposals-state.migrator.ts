/**
 * proposals-state.migrator.ts — the proposal state an older delendai left
 * is moved to where the current one reads it, and no copy stays behind.
 *
 * The proposals database used to live at `.delendai/state/`. Every
 * proposals tool refuses to start while it is still there, with a manual
 * `mv` as the remedy, and nothing performed that move: an upgraded
 * project was broken until somebody did it by hand, and the emptied
 * directory stayed afterwards. The registry was once committed under the
 * documents directory (`<docsDir>/proposals/index.json`); it is a cache
 * now, regenerated under `<cacheDir>`, and the committed copy is read by
 * nothing.
 *
 * Nothing is overwritten: a database already at the current place wins,
 * and the legacy one is then reported, not moved.
 */
import { access, mkdir, readdir, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { readWorkspaceDocsDir } from '../../work-units/development-policy.service';
import {
	LEGACY_PROPOSALS_STATE_SEGMENTS,
	LEGACY_REGISTRY_SEGMENTS,
	PROPOSALS_DB_FILES,
	PROPOSALS_STATE_SEGMENTS,
} from './proposals-state.constant';

export const PROPOSALS_STATE_MIGRATOR_ID = 'proposalsStateMigrator:v1';

const exists = async (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

interface IStateLayout {
	readonly legacyDir: string;
	readonly currentDir: string;
	readonly legacyRegistry: string;
}

const layoutOf = async (root: string): Promise<IStateLayout> => ({
	legacyDir: join(root, ...LEGACY_PROPOSALS_STATE_SEGMENTS),
	currentDir: join(root, ...PROPOSALS_STATE_SEGMENTS),
	legacyRegistry: join(
		root,
		await readWorkspaceDocsDir(root),
		...LEGACY_REGISTRY_SEGMENTS,
	),
});

/** The legacy database files that are present. */
const legacyFiles = async (layout: IStateLayout): Promise<string[]> => {
	const present: string[] = [];
	for (const file of PROPOSALS_DB_FILES) {
		if (await exists(join(layout.legacyDir, file))) present.push(file);
	}
	return present;
};

const stepsFor = async (
	ctx: IMigrationContext,
): Promise<IMigrationPlanStep[]> => {
	const layout = await layoutOf(ctx.workspaceRoot);
	const steps: IMigrationPlanStep[] = [];
	const files = await legacyFiles(layout);
	if (files.length > 0) {
		const current = join(layout.currentDir, PROPOSALS_DB_FILES[0] ?? '');
		steps.push(
			(await exists(current))
				? {
						kind: 'conflict',
						detail: `both ${layout.legacyDir} and ${layout.currentDir} hold a proposals database; the current one is kept and the legacy one is left for a person to compare`,
					}
				: {
						kind: 'move',
						detail: `${files.join(', ')}: ${layout.legacyDir} → ${layout.currentDir}`,
					},
		);
	}
	if (await exists(layout.legacyRegistry)) {
		steps.push({
			kind: 'remove',
			detail: `${layout.legacyRegistry}: the registry's old committed copy; it is regenerated under the cache`,
		});
	}
	return steps;
};

export const createProposalsStateMigrator = (): IMigration => ({
	id: PROPOSALS_STATE_MIGRATOR_ID,
	detect: async (ctx) => (await stepsFor(ctx)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		const layout = await layoutOf(ctx.workspaceRoot);
		const files = await legacyFiles(layout);
		const current = join(layout.currentDir, PROPOSALS_DB_FILES[0] ?? '');
		if (files.length > 0 && !(await exists(current))) {
			await mkdir(layout.currentDir, { recursive: true });
			// The sidecars carry pages the main file does not: they move
			// together, the main file last, so a half-done move is never a
			// database without its log.
			for (const file of [...files].reverse()) {
				await rename(
					join(layout.legacyDir, file),
					join(layout.currentDir, file),
				);
			}
			// The legacy directory goes only if nothing else is in it.
			if ((await readdir(layout.legacyDir)).length === 0) {
				await rmdir(layout.legacyDir);
			}
		}
		if (await exists(layout.legacyRegistry)) {
			await rm(layout.legacyRegistry);
			const folder = dirname(layout.legacyRegistry);
			if ((await readdir(folder)).length === 0) await rmdir(folder);
		}
	},
});
