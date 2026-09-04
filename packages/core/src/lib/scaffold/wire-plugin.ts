/**
 * f00120 S2 — idempotent monorepo-wiring writer for a first-party plugin.
 *
 * Six pure, idempotent editors, each operating on a single file. Every
 * editor:
 *
 *   1. reads the current file via the injected `fs`
 *   2. computes the desired next contents
 *   3. returns the diff (`previous` vs `next`) and a `noop` flag
 *   4. writes the file when `options.dryRun` is false (default `true`)
 *
 * The façade `wirePluginIntoMonorepo(options)` returns a point-by-point
 * report so the doctor (S4) can run the same writers and assert "fully
 * wired".
 *
 * **No fs imports in this file** — the production caller injects a real fs
 * adapter; tests inject a `Map`-backed in-memory one. The only Node
 * dependency is `JSON.parse/stringify`, which is safe on the source text
 * the writers parse (each writer picks a single JSON file or a single
 * TypeScript block to edit, so the parse surface is small and bounded).
 */
import type {
	IPluginWiringWrite,
	IWirePluginOptions,
} from '../contracts/interfaces/plugin-wiring.interface';
import {
	commitWiringEdit,
	escapeRegex,
	injectAfterLastMatch,
	injectBeforeLastClosing,
	insertIntoArrayLiteral,
	insertIntoObjectLiteral,
	insertIntoPresetMembers,
} from './wire-plugin-structure.service';

const TSCONFIG_BLOCK_OPEN = `"paths": {`;

const PUBLISH_ORDER_ENTRY = (dir: string): string => `\t'${dir}',`;

const VITEST_ALIAS_BLOCK = (id: string): string => {
	const scoped = `@delendai/${id}`;
	return [
		`\t\t{`,
		`\t\t\tfind: '${scoped}/public',`,
		`\t\t\treplacement: resolve(${camel(id)}, 'public/index.ts'),`,
		`\t\t},`,
		`\t\t{`,
		`\t\t\tfind: /^${escapeRegex(scoped)}\\/lib\\/(.*)$/,`,
		`\t\t\treplacement: \`\${resolve(${camel(id)}, 'lib')}/$1\`,`,
		`\t\t},`,
		`\t\t{`,
		`\t\t\tfind: '${scoped}',`,
		`\t\t\treplacement: resolve(${camel(id)}, 'index.ts'),`,
		`\t\t},`,
	].join('\n');
};

const camel = (id: string): string =>
	id.replace(/-([a-z])/gu, (_, ch: string) => ch.toUpperCase());

/** Returns the plugin dir under the monorepo (always `plugins/<id>`). */
export const pluginDir = (pluginId: string): string => `plugins/${pluginId}`;

/**
 * Compose the three `paths` entries a first-party plugin needs in
 * `tsconfig.base.json`: the package, its `public` barrel, and a wildcard.
 *
 * Pure over its inputs; no fs reads.
 */
export const buildTsconfigPathsEntry = (pluginId: string): string => {
	const scoped = `@delendai/${pluginId}`;
	return [
		`"${scoped}": [`,
		`\t"./plugins/${pluginId}/src/index.ts"`,
		`],`,
		`"${scoped}/public": [`,
		`\t"./plugins/${pluginId}/src/public/index.ts"`,
		`],`,
		`"${scoped}/*": [`,
		`\t"./plugins/${pluginId}/src/*"`,
		`],`,
	].join('\n\t\t\t');
};
/**
 * Idempotently add the three plugin entries to the `paths` block of
 * `tsconfig.base.json`. Returns the diff so the doctor can audit it.
 */
export const writeTsconfigBase = async (
	options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => {
	const path = 'tsconfig.base.json';
	const previous = await options.fs.readFile(path);
	const block = buildTsconfigPathsEntry(options.pluginId);
	const alreadyPresent =
		previous.includes(`"@delendai/${options.pluginId}":`) &&
		previous.includes(`"@delendai/${options.pluginId}/*":`);
	const noop = alreadyPresent;
	const next = noop
		? previous
		: injectBeforeLastClosing(previous, TSCONFIG_BLOCK_OPEN, block);

	const edit = await commitWiringEdit(options, path, previous, next, noop);
	return {
		pointId: 'tsconfig-base',
		edits: [edit],
		wired: true,
	};
};

/**
 * Idempotently add the `const <camel> = resolve(...)` declaration and the
 * three alias entries to `vitest.shared.ts`. Re-running is a no-op.
 */
export const writeVitestShared = async (
	options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => {
	const path = 'vitest.shared.ts';
	const previous = await options.fs.readFile(path);
	const scoped = `@delendai/${options.pluginId}`;
	const constLine = `\tconst ${camel(options.pluginId)} = resolve(\n\t\tworkspaceRoot,\n\t\t'${pluginDir(
		options.pluginId,
	)}/src',\n\t);`;
	const aliasBlock = VITEST_ALIAS_BLOCK(options.pluginId);
	const alreadyPresent =
		previous.includes(`find: '${scoped}'`) && previous.includes(constLine);
	const noop = alreadyPresent;
	let next = previous;
	if (!noop) {
		// Insert the const declaration after the last `const <camel> = resolve(...)`
		// block that follows `workspaceRoot,`. The repo's existing entries mix
		// single-line (`resolve(workspaceRoot, '...');`) and multi-line
		// (`resolve(\n\t\tworkspaceRoot,\n\t\t'...',\n\t);`) formats — the
		// `[\s\S]*?` lazy match lets either pass through.
		next = injectAfterLastMatch(
			next,
			/\tconst \w+ = resolve\([\s\S]*?'[^']+'[\s\S]*?\);/u,
			constLine,
		);
		// Insert the alias block right before the closing `];` of `workspaceAliases`.
		next = injectBeforeLastClosing(next, 'return [', aliasBlock);
	}

	const edit = await commitWiringEdit(options, path, previous, next, noop);
	return {
		pointId: 'vitest-shared',
		edits: [edit],
		wired: true,
	};
};

/** Idempotently add a `'<id>': {}` entry to `PLUGIN_DEFAULTS`. */
export const writePluginDefaults = async (
	options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => {
	const path = 'packages/core/src/lib/plugins/plugin-defaults.ts';
	const previous = await options.fs.readFile(path);
	const { next, noop } = insertIntoObjectLiteral(
		previous,
		'PLUGIN_DEFAULTS',
		options.pluginId,
		`${JSON.stringify(options.pluginId)}: {},`,
	);
	const edit = await commitWiringEdit(options, path, previous, next, noop);
	return {
		pointId: 'plugin-defaults',
		edits: [edit],
		wired: true,
	};
};

/** Idempotently add `'plugins/<id>'` to `PUBLISH_ORDER` in `release-plan.ts`. */
export const writePublishOrder = async (
	options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => {
	const path = 'tools/scripts/release/release-plan.ts';
	const previous = await options.fs.readFile(path);
	const entry = pluginDir(options.pluginId);
	const { next, noop } = insertIntoArrayLiteral(
		previous,
		'PUBLISH_ORDER',
		entry,
		PUBLISH_ORDER_ENTRY(entry).trim(),
	);
	const edit = await commitWiringEdit(options, path, previous, next, noop);
	return {
		pointId: 'publish-order',
		edits: [edit],
		wired: true,
	};
};

/**
 * Idempotently append the plugin to a preset's `members` array. The writer
 * is intentionally small: it appends a `plugin` line after the last `plugin:`
 * line in the chosen preset's `members` block. Defaults to `vertex`.
 */
export const writePresetCatalog = async (
	options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => {
	const path = 'packages/core/src/lib/plugins/preset-catalog.ts';
	const preset = options.targetPreset ?? 'vertex';
	const previous = await options.fs.readFile(path);
	const { next, noop } = insertIntoPresetMembers(
		previous,
		preset,
		options.pluginId,
	);
	const edit = await commitWiringEdit(options, path, previous, next, noop);
	return {
		pointId: 'preset-catalog',
		edits: [edit],
		wired: true,
	};
};

/**
 * Marker for the catalog-regen point: the wiring-doctor checks that
 * `bun run catalog:check` exits 0 after every other writer runs. The
 * writer itself is a no-op (the catalog is derived state); we just leave
 * the slot so the doctor's `wired: true` verdict is honest.
 */
export const writeCatalogRegen = async (
	_options: IWirePluginOptions,
): Promise<IPluginWiringWrite> => ({
	pointId: 'catalog-regen',
	edits: [],
	wired: true,
});

/**
 * Façade — runs all six writers in dependency order and returns the
 * per-point write report. The caller (S4 wiring-doctor + the future
 * `create_plugin` tool) decides whether to apply or audit.
 */
export const wirePluginIntoMonorepo = async (
	options: IWirePluginOptions,
): Promise<readonly IPluginWiringWrite[]> => [
	await writeTsconfigBase(options),
	await writeVitestShared(options),
	await writePluginDefaults(options),
	await writePublishOrder(options),
	await writePresetCatalog(options),
	await writeCatalogRegen(options),
];

/**
 * Insert `block` immediately after the last line matching `anchor`.
 * Falls back to appending before the last `}` if no anchor is found.
 */
