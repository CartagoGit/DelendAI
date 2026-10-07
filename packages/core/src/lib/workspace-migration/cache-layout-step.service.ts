import { isAbsolute, relative } from 'node:path';

import { createFileLifecycleStateStore } from '../cache/file-lifecycle-state-store.service';
import { defaultCacheLayoutMigrations } from '../cache/cache-layout-migrations.registry';
import { runPendingCacheLayoutMigrations } from '../cache/run-pending-cache-layout-migrations.service';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { ICacheLayoutRunResult } from '../contracts/interfaces/cache-layout.interface';
import type { IMigrationOutcome } from '../contracts/interfaces/workspace-migration.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	parseConfigFile,
} from '../plugins/load-config-file';
import { resolveWorkspaceContained } from '../shared/contain-path';
import { readConfigText } from '../work-units/command-args.helper';

/**
 * The cache directory the workspace's configuration names, contained in
 * the workspace. A configuration that cannot be read is not guessed at:
 * migrating the wrong directory is worse than waiting for the next boot.
 */
const resolveConfiguredCacheDirAbs = async (
	workspaceRoot: string,
): Promise<string> => {
	const text = await readConfigText(workspaceRoot);
	const diagnosis = diagnoseConfigFile(text);
	if (diagnosis.issues.length > 0)
		throw new Error(
			`${DEFAULT_CONFIG_FILENAME} has problems (${diagnosis.issues.join('; ')}), so the cache directory is not known`,
		);
	const cacheDir =
		parseConfigFile(text).cacheDir ?? DEFAULT_CORE_PATHS.cacheDir;
	const contained = resolveWorkspaceContained(
		workspaceRoot,
		isAbsolute(cacheDir) ? relative(workspaceRoot, cacheDir) : cacheDir,
	);
	if (!contained.ok)
		throw new Error(
			`cacheDir escapes workspace: ${cacheDir} (${contained.reason})`,
		);
	return contained.abs;
};

/** The engine's outcome vocabulary for what the layout run did. */
export const cacheLayoutOutcomes = (
	result: ICacheLayoutRunResult,
): readonly IMigrationOutcome[] => {
	if (result.status === 'planned')
		return result.pending.map((step) => ({
			status: 'planned',
			id: step.id,
			steps: step.steps,
		}));
	if (result.status === 'migrated')
		return result.applied.map((step) => ({
			status: 'migrated',
			id: step.id,
		}));
	if (result.status === 'failed')
		return [{ status: 'failed', id: result.id, reason: result.reason }];
	return [];
};

/** Run the cache layout lifecycle for a workspace with the shipped registry. */
export const runCacheLayoutStep = (
	workspaceRoot: string,
	dryRun: boolean,
): Promise<ICacheLayoutRunResult> =>
	runPendingCacheLayoutMigrations({
		workspaceRoot,
		store: createFileLifecycleStateStore(workspaceRoot),
		migrations: defaultCacheLayoutMigrations(),
		resolveCacheDirAbs: () => resolveConfiguredCacheDirAbs(workspaceRoot),
		dryRun,
	});
