/**
 * vscode-cache-exclude.migrator.ts — a project `init` set up before the
 * editor was told to leave the cache alone gets the exclusion too.
 *
 * `init` writes it into a new settings file; this is the path of the
 * projects that already have one. It runs on every CLI start, adds only
 * what is missing, and leaves a settings file that does not exist (the
 * person chose not to have one) or that is not a settings object alone.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { configuredCacheDir } from '../../shared/delendai-records';
import {
	VSCODE_CACHE_EXCLUDE_MIGRATOR_ID,
	VSCODE_SETTINGS_FILE,
} from './vscode-cache-exclude.constant';
import { cacheExcludeGlob, mergeCacheExcludes } from './vscode-cache-exclude';

const merged = async (
	ctx: IMigrationContext,
): Promise<{ readonly path: string; readonly text: string } | undefined> => {
	const path = join(ctx.workspaceRoot, VSCODE_SETTINGS_FILE);
	const existing = await readFile(path, 'utf8').catch(() => undefined);
	if (existing === undefined) return undefined;
	const text = mergeCacheExcludes(
		existing,
		configuredCacheDir(ctx.workspaceRoot),
	);
	return text === undefined ? undefined : { path, text };
};

const stepsFor = async (
	ctx: IMigrationContext,
): Promise<IMigrationPlanStep[]> => {
	if ((await merged(ctx)) === undefined) return [];
	const glob = cacheExcludeGlob(configuredCacheDir(ctx.workspaceRoot));
	return [
		{
			kind: 'rewrite',
			detail: `${VSCODE_SETTINGS_FILE}: exclude ${glob ?? 'the cache'} from files.watcherExclude and search.exclude`,
		},
	];
};

export const createVscodeCacheExcludeMigrator = (): IMigration => ({
	id: VSCODE_CACHE_EXCLUDE_MIGRATOR_ID,
	detect: async (ctx) => (await stepsFor(ctx)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		const next = await merged(ctx);
		if (next === undefined) return;
		await writeFile(next.path, next.text, 'utf8');
	},
});
