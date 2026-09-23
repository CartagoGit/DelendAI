/**
 * config-transitions.service.ts — when `delendai.config.json` changes,
 * bring the workspace along, instead of leaving it describing the old one.
 *
 * ## The gap this closes
 *
 * Every migrator in this directory ADOPTS: it heals legacy identity once,
 * records an id, and never runs again. None of them could react to an
 * edit, because none of them knew what the configuration used to be.
 * Change `cacheDir` and the runtime starts a fresh, empty cache beside
 * the old one, which quietly keeps every proposal index, lock and
 * evidence record the workspace had. Remove a plugin and its cache stays
 * forever. The only move that existed was from the DEFAULT path, never
 * from the path this workspace was actually using.
 *
 * ## How "the previous configuration" is known
 *
 * Recorded, whenever possible: after every successful pass the effective
 * values are written to `.delendai/applied-config.json`. When there is no
 * record — a workspace that predates this, or a fresh clone — the
 * previous configuration is INFERRED, and inferred conservatively: it is
 * the current one, except where the disk proves otherwise (a populated
 * cache at the default path while the config names another). Anything
 * that cannot be proven is assumed unchanged, because the cost of a
 * wrong inference is deleting or moving somebody's data.
 *
 * ## What it refuses
 *
 *   - An invalid config file. Parsing forgives a JSONC error by yielding
 *     `{}`, and `{}` read as "the configuration" means every plugin was
 *     removed. So a file with any diagnostic runs no transition at all.
 *   - Moving tracked files. `docsDir` holds versioned documentation, and
 *     moving it is a commit somebody makes; it is reported, not done.
 *   - Anything outside the workspace, or a plugin cache whose name is
 *     not a plain identifier.
 *
 * The snapshot is written only after every transition applied — the
 * same record-after-apply rule the migration engine follows, for the
 * same reason: recording first would make a half-applied change permanent.
 */

import { lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { bootstrapCacheLayout } from '../cache/cache-layout-bootstrap';
import { APPLIED_CONFIG_PATH } from '../contracts/constants/config-transition.constant';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type {
	IAppliedConfigSnapshot,
	IConfigTransition,
	IConfigTransitionOutcome,
	IConfigTransitionRunResult,
} from '../contracts/interfaces/config-transition.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	parseConfigFile,
	type IDelendaiConfigFile,
} from '../plugins/load-config-file';
import { writeFileAtomic } from '../shared/atomic-write';

/** Where the applied-configuration record lives, for the report to name. */
const RECORD_PATH = APPLIED_CONFIG_PATH.join('/');
import { ensureSelfIgnoringDir } from '../shared/self-ignoring-dir';
import { resolveWorkspaceContained } from '../shared/contain-path';

export type {
	IAppliedConfigSnapshot,
	IConfigTransition,
	IConfigTransitionOutcome,
	IConfigTransitionRunResult,
} from '../contracts/interfaces/config-transition.interface';

/** A plugin cache directory name that cannot address anything else. */
const PLAIN_PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const exists = async (path: string): Promise<boolean> => {
	try {
		await lstat(path);
		return true;
	} catch {
		return false;
	}
};

/** The effective, consequence-bearing values of a configuration. */
export const snapshotOf = (
	config: IDelendaiConfigFile,
): IAppliedConfigSnapshot => ({
	version: 1,
	cacheDir: config.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir,
	docsDir: config.docsDir ?? DEFAULT_CORE_PATHS.docsDir,
	plugins: Object.entries(config.plugins ?? {})
		.filter(([, entry]) => entry.enabled !== false)
		.map(([name]) => name)
		.sort((left, right) => left.localeCompare(right)),
});

export const sameSnapshot = (
	left: IAppliedConfigSnapshot,
	right: IAppliedConfigSnapshot,
): boolean =>
	left.cacheDir === right.cacheDir &&
	left.docsDir === right.docsDir &&
	left.plugins.length === right.plugins.length &&
	left.plugins.every((name, index) => name === right.plugins[index]);

const isSnapshot = (value: unknown): value is IAppliedConfigSnapshot => {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.version === 1 &&
		typeof record.cacheDir === 'string' &&
		typeof record.docsDir === 'string' &&
		Array.isArray(record.plugins) &&
		record.plugins.every((name) => typeof name === 'string')
	);
};

/** The recorded snapshot, or undefined when absent or unreadable. */
export const readAppliedSnapshot = async (
	workspaceRoot: string,
): Promise<IAppliedConfigSnapshot | undefined> => {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(join(workspaceRoot, ...APPLIED_CONFIG_PATH), 'utf8'),
		);
		return isSnapshot(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
};

export const writeAppliedSnapshot = async (
	workspaceRoot: string,
	snapshot: IAppliedConfigSnapshot,
): Promise<void> => {
	// Same reason as the migration journal: this is written on first
	// sight of a workspace, so the directory it lands in must not be a
	// surprise in somebody's `git status`.
	await ensureSelfIgnoringDir(join(workspaceRoot, APPLIED_CONFIG_PATH[0]));
	await writeFileAtomic(
		join(workspaceRoot, ...APPLIED_CONFIG_PATH),
		`${JSON.stringify(snapshot, null, '\t')}\n`,
	);
};

/**
 * The previous configuration when none was recorded: the current one,
 * except where the disk proves otherwise. See the module header for why
 * nothing else is inferred.
 */
export const inferPreviousSnapshot = async (
	current: IAppliedConfigSnapshot,
	workspaceRoot: string,
): Promise<IAppliedConfigSnapshot> => {
	const defaultCache = DEFAULT_CORE_PATHS.cacheDir;
	if (
		current.cacheDir !== defaultCache &&
		(await exists(join(workspaceRoot, defaultCache))) &&
		!(await exists(join(workspaceRoot, current.cacheDir)))
	) {
		return { ...current, cacheDir: defaultCache };
	}
	return current;
};

const containedOrThrow = (workspaceRoot: string, path: string): string => {
	const contained = resolveWorkspaceContained(workspaceRoot, path);
	if (!contained.ok)
		throw new Error(`refusing a path outside the workspace: ${path}`);
	return contained.abs;
};

/** `cacheDir` changed: move the cache, never overwriting what is there. */
export const cacheDirTransition = (): IConfigTransition => ({
	id: 'config:cache-dir',
	plan: (previous, next) =>
		previous.cacheDir === next.cacheDir
			? []
			: [
					{
						kind: 'move-cache',
						detail: `${previous.cacheDir} -> ${next.cacheDir}`,
					},
				],
	apply: async (previous, next, ctx) => {
		const from = containedOrThrow(ctx.workspaceRoot, previous.cacheDir);
		const to = containedOrThrow(ctx.workspaceRoot, next.cacheDir);
		// The mover this runtime already trusts for cache paths: it
		// renames when the destination is free and otherwise merges
		// entry by entry, skipping anything already present.
		await bootstrapCacheLayout({
			workspaceRootAbs: ctx.workspaceRoot,
			cacheDirAbs: to,
			legacyPaths: [{ sourceAbs: from, destinationAbs: to }],
			includeBuiltInLegacyPaths: false,
			createPluginDirs: false,
			apply: true,
		});
	},
});

const removedPlugins = (
	previous: IAppliedConfigSnapshot,
	next: IAppliedConfigSnapshot,
): readonly string[] =>
	previous.plugins.filter(
		(name) => !next.plugins.includes(name) && PLAIN_PLUGIN_NAME.test(name),
	);

/** A plugin left the configuration: its cache is nobody's any more. */
export const removedPluginCacheTransition = (): IConfigTransition => ({
	id: 'config:removed-plugin-cache',
	plan: (previous, next) =>
		removedPlugins(previous, next).map((name) => ({
			kind: 'evict-plugin-cache',
			detail: `${next.cacheDir}/${name}`,
		})),
	apply: async (previous, next, ctx) => {
		for (const name of removedPlugins(previous, next)) {
			const target = containedOrThrow(
				ctx.workspaceRoot,
				join(next.cacheDir, name),
			);
			await rm(target, { recursive: true, force: true });
		}
	},
});

/** `docsDir` changed: versioned files move by commit, so say so. */
export const docsDirTransition = (): IConfigTransition => ({
	id: 'config:docs-dir',
	plan: (previous, next) =>
		previous.docsDir === next.docsDir
			? []
			: [
					{
						kind: 'manual',
						detail: `docsDir changed ${previous.docsDir} -> ${next.docsDir}; tracked documentation is not moved automatically — move it with \`git mv\` in a commit`,
					},
				],
	apply: async () => undefined,
});

/** The transitions a workspace runs, in declaration order. */
export const defaultConfigTransitions = (): readonly IConfigTransition[] => [
	cacheDirTransition(),
	removedPluginCacheTransition(),
	docsDirTransition(),
];

const readConfigText = async (
	workspaceRoot: string,
): Promise<string | undefined> => {
	try {
		return await readFile(
			join(workspaceRoot, DEFAULT_CONFIG_FILENAME),
			'utf8',
		);
	} catch {
		return undefined;
	}
};

export const reconcileConfigTransitions = async (input: {
	readonly workspaceRoot: string;
	readonly dryRun: boolean;
	readonly transitions?: readonly IConfigTransition[];
}): Promise<IConfigTransitionRunResult> => {
	const text = await readConfigText(input.workspaceRoot);
	const recorded = await readAppliedSnapshot(input.workspaceRoot);
	const previousSource = recorded === undefined ? 'inferred' : 'recorded';

	const diagnosis = diagnoseConfigFile(text);
	if (diagnosis.issues.length > 0) {
		return {
			previousSource,
			outcomes: [],
			acted: false,
			recorded: 'withheld',
			recordPath: RECORD_PATH,
			skipped: `${DEFAULT_CONFIG_FILENAME} has problems (${diagnosis.issues.join('; ')}); no configuration change was applied, because an unreadable file would read as "every plugin removed"`,
		};
	}

	const next = snapshotOf(parseConfigFile(text));
	const previous =
		recorded ?? (await inferPreviousSnapshot(next, input.workspaceRoot));

	const outcomes: IConfigTransitionOutcome[] = [];
	for (const transition of input.transitions ?? defaultConfigTransitions()) {
		const steps = transition.plan(previous, next);
		if (steps.length === 0) continue;
		if (input.dryRun) {
			outcomes.push({ status: 'planned', id: transition.id, steps });
			continue;
		}
		try {
			await transition.apply(previous, next, {
				workspaceRoot: input.workspaceRoot,
				dryRun: false,
			});
		} catch (error) {
			outcomes.push({
				status: 'failed',
				id: transition.id,
				reason: error instanceof Error ? error.message : String(error),
			});
			return {
				previousSource,
				outcomes,
				acted: true,
				recorded: 'withheld',
				recordPath: RECORD_PATH,
			};
		}
		outcomes.push({ status: 'applied', id: transition.id, steps });
	}

	// Record the configuration the workspace now reflects. A workspace
	// with no config file and no record has nothing to record: writing
	// defaults would later read as a deliberate configuration.
	//
	// Withholding it more widely was considered and rejected: this record
	// is HOW a later edit is noticed. Skip it on the first run and a
	// `cacheDir` change before the second is missed, leaving the old
	// cache orphaned in silence. So it is written — and, because writing
	// a file into somebody's repository is acting, it is reported.
	const hasSomethingToRecord = text !== undefined || recorded !== undefined;
	const alreadyMatches =
		recorded !== undefined && sameSnapshot(recorded, next);
	const willWrite = !input.dryRun && hasSomethingToRecord && !alreadyMatches;
	if (willWrite) await writeAppliedSnapshot(input.workspaceRoot, next);

	return {
		previousSource,
		outcomes,
		// `acted` gates the caller's entire report. A run whose only
		// effect was creating this file must not answer `false`.
		acted: outcomes.length > 0 || willWrite,
		recorded: willWrite
			? 'written'
			: alreadyMatches
				? 'unchanged'
				: 'withheld',
		recordPath: RECORD_PATH,
	};
};
