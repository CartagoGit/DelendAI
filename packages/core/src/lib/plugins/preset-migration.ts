/**
 * preset-migration.ts — what becomes of a configuration that was made
 * for a retired preset (f00803).
 *
 * The preset id is not stored in `delendai.config.json`: `init` writes
 * the preset expanded into the `plugins` map, so an existing map keeps
 * working whatever the catalogue lists. What can break is a launch
 * argument (`--preset=<retired id>`) and the wish to know which pack a
 * map now corresponds to. This module answers both without ever
 * editing a plugin map.
 *
 *  - `resolveRetiredPreset` turns a retired id into its replacement
 *    (the alias table lives in `preset-catalog.ts`) and the notice that
 *    names it, plus the plugins the old id carried that the pack does not.
 *  - `findRetiredPresetMatch` / `describeRetiredPresetMatch` recognise a
 *    plugin map equal to a retired preset (the doctor check).
 *  - `migratePresetProvenance` is the start-up step: it records, in a
 *    journal beside the other caches, which retired preset a map
 *    matches, once, and touches nothing else.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
	PRESET_MIGRATION_JOURNAL,
	RETIRED_PRESET_MEMBERS,
} from '../contracts/constants/preset-migration.constant';
import type {
	IPresetMigrationInput,
	IPresetMigrationResult,
	IRetiredPresetResolution,
} from '../contracts/interfaces/preset-migration.interface';
import { DEFAULT_CONFIG_FILENAME, parseConfigFile } from './load-config-file';
import {
	type IRetiredPresetId,
	presetAliasOf,
	RETIRED_PRESET_ID,
	resolvePresetMembers,
	resolveStackPackMembers,
} from './preset-catalog';

type IAlias = ReturnType<typeof presetAliasOf>;

const isRetiredPresetId = (value: string): value is IRetiredPresetId =>
	(RETIRED_PRESET_ID as readonly string[]).includes(value);

const replacementLabel = (alias: IAlias): string =>
	alias.stack === undefined
		? `'${alias.replacement}'`
		: `'${alias.replacement}' with the '${alias.stack}' stack overlay`;

const membersOf = (alias: IAlias): readonly string[] =>
	alias.stack === undefined
		? resolvePresetMembers(alias.replacement)
		: resolveStackPackMembers(alias.stack);

/** Pure and silent: callers decide where the notice goes. */
export const resolveRetiredPreset = (
	id: string | undefined,
): IRetiredPresetResolution | undefined => {
	if (id === undefined || !isRetiredPresetId(id)) return undefined;
	const alias = presetAliasOf(id);
	const members = membersOf(alias);
	const dropped = (RETIRED_PRESET_MEMBERS[id] ?? []).filter(
		(plugin) => !members.includes(plugin),
	);
	const extras =
		dropped.length === 0
			? ''
			: ` Not in the pack, add them as extras if you use them: ${dropped.join(', ')}.`;
	return {
		retired: id,
		replacement: alias.replacement,
		...(alias.stack === undefined ? {} : { stack: alias.stack }),
		members,
		dropped,
		notice: `preset '${id}' is deprecated, use ${replacementLabel(alias)} instead.${extras}`,
	};
};

/** The plugins a `plugins` map keeps on (`enabled: false` turns one off). */
export const enabledPlugins = (
	plugins: Readonly<Record<string, { readonly enabled?: boolean } | null>>,
): readonly string[] =>
	Object.entries(plugins)
		.filter(([, value]) => value?.enabled !== false)
		.map(([plugin]) => plugin)
		.sort();

/** The retired preset whose old membership a plugin map equals exactly. */
export const findRetiredPresetMatch = (
	enabled: readonly string[],
): IRetiredPresetResolution | undefined => {
	const sorted = [...new Set(enabled)].sort();
	for (const id of RETIRED_PRESET_ID) {
		const old = RETIRED_PRESET_MEMBERS[id];
		if (
			old !== undefined &&
			old.length === sorted.length &&
			old.every((plugin, index) => plugin === sorted[index])
		)
			return resolveRetiredPreset(id);
	}
	return undefined;
};

/** The doctor line for a config, or `undefined` when it matches nothing retired. */
export const describeRetiredPresetMatch = (
	plugins: Readonly<Record<string, { readonly enabled?: boolean } | null>>,
): string | undefined => {
	const match = findRetiredPresetMatch(enabledPlugins(plugins));
	if (match === undefined) return undefined;
	const pack =
		match.stack === undefined
			? `'${match.replacement}'`
			: `'${match.replacement}' with the '${match.stack}' stack overlay`;
	return `plugin map equals the retired preset '${match.retired}'; the matching pack is ${pack}. Nothing was changed.`;
};

/**
 * Start-up step. Journals which retired preset the plugin map matches,
 * once per retired id, and edits nothing: a map the user changed no
 * longer equals a retired membership and yields `unchanged`. Never throws.
 */
export const migratePresetProvenance = async (
	input: IPresetMigrationInput,
): Promise<IPresetMigrationResult> => {
	const match = findRetiredPresetMatch(enabledPlugins(input.plugins));
	if (match === undefined) return { outcome: 'unchanged' };
	const journal = join(input.root, PRESET_MIGRATION_JOURNAL);
	try {
		const before = await readFile(journal, 'utf8').catch(() => '');
		if (before.includes(`"retired":"${match.retired}"`))
			return { outcome: 'unchanged', match };
		await mkdir(dirname(journal), { recursive: true });
		await appendFile(
			journal,
			`${JSON.stringify({
				at: (input.now ?? new Date()).toISOString(),
				retired: match.retired,
				replacement: match.replacement,
				...(match.stack === undefined ? {} : { stack: match.stack }),
			})}\n`,
		);
		return { outcome: 'recorded', match };
	} catch {
		return { outcome: 'unchanged', match };
	}
};

/**
 * The plugins a `--preset=<id>` launch argument selects. A retired id
 * resolves to its replacement and the notice naming it goes to `write`
 * (stderr in the server: stdout is the MCP transport); any other id
 * resolves through the catalogue.
 */
export const resolvePresetForLaunch = (
	id: string | undefined,
	write: (line: string) => void,
): readonly string[] => {
	const retired = resolveRetiredPreset(id);
	if (retired === undefined) return resolvePresetMembers(id);
	write(`[delendai/preset] ${retired.notice}\n`);
	return retired.members;
};

/**
 * Start-up entry: reads the workspace's config and journals which
 * retired preset its plugin map matches. Never throws and never writes
 * the config.
 */
export const migrateWorkspacePresetProvenance = async (input: {
	readonly workspace: string;
	readonly configPath?: string | undefined;
	readonly now?: Date | undefined;
}): Promise<IPresetMigrationResult> => {
	const path =
		input.configPath === undefined
			? join(input.workspace, DEFAULT_CONFIG_FILENAME)
			: resolve(input.workspace, input.configPath);
	const text = await readFile(path, 'utf8').catch(() => undefined);
	const plugins = parseConfigFile(text).plugins;
	if (plugins === undefined) return { outcome: 'unchanged' };
	return migratePresetProvenance({
		root: input.workspace,
		plugins,
		now: input.now,
	});
};
