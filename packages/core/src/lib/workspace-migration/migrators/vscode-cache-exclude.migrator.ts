/**
 * vscode-cache-exclude.migrator.ts — a project `init` set up before the
 * editor was told to leave the cache alone gets the exclusion too.
 *
 * `init` writes it into a new settings file; this is the path of the
 * projects that already have one. `.vscode/settings.json` is usually
 * tracked, so a start never writes it: it is `explicitOnly`, applied by
 * `migrate`, and `pendingCacheExclude` is what a start reports. It adds
 * only what is missing, leaves a settings file that does not exist (the
 * person chose not to have one) or that is not a settings object alone,
 * and never touches one in a linked git worktree.
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { configuredCacheDir } from '../../shared/delendai-records';
import { hasAdopted } from '../legacy-migration.service';
import {
	VSCODE_CACHE_EXCLUDE_MIGRATOR_ID,
	VSCODE_SETTINGS_FILE,
} from './vscode-cache-exclude.constant';
import { cacheExcludeGlob, mergeCacheExcludes } from './vscode-cache-exclude';

/** A linked worktree has a `.git` file; a checkout has a directory. */
const inLinkedWorktree = async (workspaceRoot: string): Promise<boolean> =>
	(
		await stat(join(workspaceRoot, '.git')).catch(() => undefined)
	)?.isFile() === true;

const merged = async (
	ctx: IMigrationContext,
): Promise<{ readonly path: string; readonly text: string } | undefined> => {
	if (await inLinkedWorktree(ctx.workspaceRoot)) return undefined;
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
	explicitOnly: true,
	detect: async (ctx) => (await stepsFor(ctx)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		const next = await merged(ctx);
		if (next === undefined) return;
		await writeFile(next.path, next.text, 'utf8');
	},
});

/**
 * What a start says about the exclusion, or `undefined` when there is
 * nothing to say. Reads; never writes.
 */
export const pendingCacheExclude = async (
	workspaceRoot: string,
): Promise<string | undefined> =>
	(await hasAdopted(workspaceRoot)) &&
	(await createVscodeCacheExcludeMigrator().detect({
		workspaceRoot,
		dryRun: true,
	}))
		? `${VSCODE_SETTINGS_FILE} does not yet keep the editor off the cache: \`delendai migrate run\` adds it`
		: undefined;
