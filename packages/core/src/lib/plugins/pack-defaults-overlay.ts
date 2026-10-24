/**
 * pack-defaults-overlay.ts — r00011 S1: per-pack tuned option overlays.
 *
 * Each stack pack (e.g. `web-app`, `backend-api`, `cli-tool`) bundles
 * a curated plugin set + a small set of tuned per-plugin defaults.
 * Precedence is:
 *   PLUGIN_DEFAULTS  →  PACK_DEFAULTS_OVERLAY[packId][pluginId]  →  user config
 * (user always wins).
 *
 * The overlay is pure data; `resolvePackOptions` is the pure accessor.
 * Apply it via `mergePackDefaults(plugins, userConfig, packId)` so a
 * caller (init, configuration_center) can compose the final config.
 */
import type { IPresetKind } from './preset-catalog';

/**
 * The set of valid pack ids. Mirrors the new PRESET_KIND entries added
 * by r00011 S1 (`web-app`, `backend-api`, `cli-tool`). Kept narrow on
 * purpose: the chain presets (`minimal`..`vertex`) do not get an
 * overlay — they are pure plugin-selection presets.
 */
export type IPackId = Extract<
	IPresetKind,
	'web-app' | 'backend-api' | 'cli-tool'
>;

/** A read-only map of plugin id → options. */
export type IPluginOptionsMap = Readonly<Record<string, unknown>>;

/**
 * The overlay table: pack id → plugin id → options. Adding a new
 * pack means adding one entry here + one entry in PRESET_CATALOG.
 * The two stay in sync via the `lint:setup` (preset-drift) gate
 * which knows the pack membership.
 */
export const PACK_DEFAULTS_OVERLAY: Readonly<
	Record<IPackId, IPluginOptionsMap>
> = {
	'web-app': {
		// Tuned for a docs/marketing-heavy site: bump i18n coverage
		// and prefer BM25 for content searches.
		i18n: {
			defaultLocale: 'en',
			strict: false,
		},
		search: {
			hybridWeights: { bm25: 0.7, vector: 0.3 },
		},
		quality: {
			topActions: 8,
		},
	},
	'backend-api': {
		// Tuned for an API service: prioritise vector search on code,
		// tighter quality, stricter env validation.
		search: {
			hybridWeights: { bm25: 0.4, vector: 0.6 },
		},
		quality: {
			topActions: 5,
		},
		env: {
			strict: true,
		},
	},
	'cli-tool': {
		// Tuned for a small CLI: lean, no i18n, focused on perf.
		// No quality gate (too noisy for a 200-LoC CLI). `changelog`
		// overlay removed with the plugin itself (f00177 / MAN-001:
		// `changelog` is `private: true`, never published to npm, so it
		// cannot be a member of a preset an external adopter installs —
		// see `plugins/changelog/plugin.manifest.ts`).
		search: {
			hybridWeights: { bm25: 0.8, vector: 0.2 },
		},
	},
};

/**
 * The set of valid pack ids. Useful as a runtime guard.
 */
export const PACK_IDS: readonly IPackId[] = [
	'web-app',
	'backend-api',
	'cli-tool',
];

/**
 * Resolve the pack overlay for one (pack, plugin) pair. Pure.
 *
 * @returns A fresh copy of the overlay options, or `undefined` when
 *          the pack or plugin is unknown. Callers MUST treat the
 *          result as read-only and clone before mutating.
 */
export const resolvePackOptions = (
	packId: string,
	pluginId: string,
): Readonly<Record<string, unknown>> | undefined => {
	if (!(PACK_IDS as readonly string[]).includes(packId)) return undefined;
	const overlay = PACK_DEFAULTS_OVERLAY[packId as IPackId];
	const entry = overlay[pluginId];
	if (entry === undefined) return undefined;
	return { ...entry };
};

export interface IStackPackMeta {
	readonly id: IPackId;
	readonly title: string;
	readonly summary: string;
	readonly pluginCount: number;
}

const PACK_META: Readonly<
	Record<IPackId, { readonly title: string; readonly summary: string }>
> = {
	'web-app': {
		title: 'Web app',
		summary:
			'Astro / Next / Remix / SvelteKit / Vite. Tuned for content-heavy sites: BM25-leaning search, broader i18n, container (dockerfile) lint.',
	},
	'backend-api': {
		title: 'Backend API',
		summary:
			'Nest / Express / Hono / Fastify / Django / FastAPI. Vector-leaning search, env strict-mode, ORM-aware.',
	},
	'cli-tool': {
		title: 'CLI tool',
		summary:
			'oclif / commander / cobra / clap. Lean: perf, no quality gate.',
	},
};

/**
 * Return the metadata table for every shipped stack pack. Pure.
 */
export const describeStackPacks = (): readonly IStackPackMeta[] =>
	PACK_IDS.map((id) => {
		const meta = PACK_META[id];
		const overlay = PACK_DEFAULTS_OVERLAY[id];
		return {
			id,
			title: meta.title,
			summary: meta.summary,
			pluginCount: Object.keys(overlay).length,
		};
	});

/**
 * Merge the pack overlay on top of the caller's `userConfig` for the
 * union of plugins the pack declares. Pure: same input -> same output.
 *
 * Algorithm (precedence — user always wins):
 *   1. Start from the overlay's plugin→options for this pack.
 *   2. For each plugin the user explicitly configures, overwrite the
 *      matching overlay entry with the user's value.
 *
 * The returned map is a fresh object; mutating it does not affect the
 * overlay table.
 *
 * @param userConfig   The caller's explicit per-plugin options (read-only).
 * @param packId       The pack id, or `undefined` for "no overlay".
 */
export const mergePackDefaults = (
	userConfig: Readonly<Record<string, IPluginOptionsMap>>,
	packId: string | undefined,
): Readonly<Record<string, IPluginOptionsMap>> => {
	if (packId === undefined) return userConfig;
	if (!(PACK_IDS as readonly string[]).includes(packId)) return userConfig;

	const overlay = PACK_DEFAULTS_OVERLAY[packId as IPackId];
	const merged: Record<string, IPluginOptionsMap> = {};

	// Step 1: copy the overlay into the result.
	for (const [pluginId, options] of Object.entries(overlay)) {
		merged[pluginId] = { ...(options as IPluginOptionsMap) };
	}

	// Step 2: user config wins. Iterate the user's keys so we don't
	// surface overlay entries the user did not configure (the host
	// decides which plugins to actually pass to resolvePluginOptions).
	for (const [pluginId, userOptions] of Object.entries(userConfig)) {
		const existing = merged[pluginId];
		merged[pluginId] =
			existing !== undefined
				? { ...existing, ...userOptions }
				: { ...userOptions };
	}

	return merged;
};

/**
 * Predicate: does `value` look like a valid pack id?
 */
export const isPackId = (value: string | undefined): value is IPackId =>
	typeof value === 'string' &&
	(PACK_IDS as readonly string[]).includes(value);
