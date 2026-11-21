/**
 * model-profiles.ts — f00196 (Track L, P2) model-aware presets.
 *
 * The preset catalog (`plugins/preset-catalog.ts`) decides WHICH
 * plugins ship. This module decides HOW MANY of those tools we
 * expose to a given model at boot time, so a `small` model does not
 * get the same `tools/list` payload as a `large` model.
 *
 * A `ModelProfile` is a pure-data declaration:
 *
 *   - `maxInitialToolTokens` — hard ceiling for the boot payload
 *     sized in tokens (estimated at `bytes / 4` to stay cheap).
 *   - `maxToolSurfaceBytes`  — same idea in raw bytes; hosts that
 *     want to budget against actual JSON size use this.
 *   - `routing`              — the `UtilityWeights` from f00195 so
 *     every preset carries its own quality↔cost dial. They are
 *     independent knobs: a `small` model gets a cost-pessimistic
 *     dial because every token it sees is expensive to it.
 *
 * No I/O, no clock, no globals. Hosts that want a richer catalogue
 * can pass a `profiles` override to the lookup helpers.
 */
import type { IUtilityWeights } from '../routing/utility';

/** Tier identifier. Open-ended: `custom` hosts may register their own. */
export type TModelTier = 'small' | 'medium' | 'large';

/** A single model's tool-surface budget + routing dial. */
export interface IModelProfile {
	readonly id: TModelTier | string;
	/**
	 * Hard ceiling for the boot payload, in tokens. Used by the
	 * preset selector to filter the tool catalog before exposing
	 * `tools/list`. 4 bytes-per-token is a conservative estimate
	 * for English JSON; matches the value the token-budget dashboard
	 * uses (`tools/scripts/report/token-budget-dashboard.script.ts`).
	 */
	readonly maxInitialToolTokens: number;
	/**
	 * Same ceiling expressed in raw JSON bytes. Lets hosts reason
	 * about the budget without going through token estimation.
	 */
	readonly maxToolSurfaceBytes: number;
	/**
	 * Routing weights for this tier. Small models lean cost-first;
	 * large models can afford latency-priority routing.
	 */
	readonly routing: IUtilityWeights;
}

/**
 * The default catalog. The numbers are the ones in the f00196
 * proposal; they are intentionally round (4K / 8K / 16K tokens) so a
 * human can reason about them at a glance. Hosts can override them
 * in `delendai.config.json#modelProfiles.<tier>`.
 */
export const DEFAULT_MODEL_PROFILES: Readonly<
	Record<TModelTier, IModelProfile>
> = {
	small: {
		id: 'small',
		maxInitialToolTokens: 4_000,
		maxToolSurfaceBytes: 16_000,
		routing: { lambda: 0.5, mu: 0.3, nu: 0.2 },
	},
	medium: {
		id: 'medium',
		maxInitialToolTokens: 8_000,
		maxToolSurfaceBytes: 32_000,
		routing: { lambda: 0.3, mu: 0.4, nu: 0.3 },
	},
	large: {
		id: 'large',
		maxInitialToolTokens: 16_000,
		maxToolSurfaceBytes: 64_000,
		routing: { lambda: 0.2, mu: 0.5, nu: 0.3 },
	},
};

/**
 * Resolve a model profile by id. Unknown ids fall back to `medium`
 * (the canonical "I don't know what you are" tier). Host overrides
 * take precedence over the defaults.
 */
export const getModelProfile = (
	id: string,
	overrides?: Readonly<Record<string, IModelProfileOverride>>,
): IModelProfile => {
	if (id === 'small' || id === 'medium' || id === 'large') {
		const fromDefault = DEFAULT_MODEL_PROFILES[id];
		const fromHost = overrides?.[id];
		return fromHost ? mergeProfile(fromDefault, fromHost) : fromDefault;
	}
	const hostOverride = overrides?.[id];
	if (hostOverride)
		return mergeProfile(DEFAULT_MODEL_PROFILES.medium, hostOverride);
	return DEFAULT_MODEL_PROFILES.medium;
};

/**
 * List the default tier profiles, in declaration order. Hosts with
 * a custom catalogue can pass their own `overrides` map; we merge
 * host-known tiers into the default order, then keep the default
 * tiers that the host did not override.
 */
export const listModelProfiles = (
	overrides?: Readonly<Record<string, IModelProfileOverride>>,
): readonly IModelProfile[] => {
	const tiers: readonly TModelTier[] = ['small', 'medium', 'large'];
	const defaults = tiers.map((t) => DEFAULT_MODEL_PROFILES[t]);
	if (!overrides) return defaults;
	const seen = new Set<string>();
	const merged: IModelProfile[] = [];
	for (const t of tiers) {
		const o = overrides[t];
		merged.push(
			o
				? mergeProfile(DEFAULT_MODEL_PROFILES[t], o)
				: DEFAULT_MODEL_PROFILES[t],
		);
		seen.add(t);
	}
	for (const [id, partial] of Object.entries(overrides)) {
		if (seen.has(id)) continue;
		merged.push(
			mergeProfile(DEFAULT_MODEL_PROFILES.medium, { ...partial, id }),
		);
	}
	return merged;
};

/**
 * A host-side override for one tier. Every field is optional, so a
 * host can change only `lambda` (or only `maxInitialToolTokens`)
 * without re-stating the other fields.
 */
export interface IModelProfileOverride {
	readonly id?: string;
	readonly maxInitialToolTokens?: number;
	readonly maxToolSurfaceBytes?: number;
	readonly routing?: Partial<IUtilityWeights>;
}

/**
 * Pick a tier from a free-form tier hint. Returns `'medium'` for
 * anything unknown — it is the safest default because its budget
 * is large enough to fit any catalog the core ships today.
 */
export const detectModelTier = (
	hint: string | null | undefined,
): TModelTier => {
	if (!hint) return 'medium';
	const normalised = hint.toLowerCase().trim();
	if (
		normalised === 'small' ||
		normalised === 'nano' ||
		normalised === 'mini'
	) {
		return 'small';
	}
	if (
		normalised === 'large' ||
		normalised === 'xl' ||
		normalised === 'xxl' ||
		normalised === 'opus'
	) {
		return 'large';
	}
	return 'medium';
};

/**
 * Filter a tool list by a model profile's byte budget. The filter
 * is GREEDY: tools are taken in the order received until the next
 * tool would push the cumulative bytes over `maxToolSurfaceBytes`.
 * Deterministic — same input + same order → same output.
 */
export const filterToolsByProfile = <T extends { staticBytes?: number }>(
	tools: readonly T[],
	profile: IModelProfile,
): readonly T[] => {
	let budget = profile.maxToolSurfaceBytes;
	const out: T[] = [];
	for (const tool of tools) {
		const bytes = tool.staticBytes ?? 0;
		if (bytes > budget) continue;
		out.push(tool);
		budget -= bytes;
	}
	return out;
};

/**
 * Merge a default profile with a host override. Host values WIN on
 * every numeric field; the `id` and `routing` are deep-merged so a
 * host may change only one weight without losing the others.
 */
const mergeProfile = (
	base: IModelProfile,
	override: IModelProfileOverride,
): IModelProfile => ({
	id: override.id ?? base.id,
	maxInitialToolTokens:
		override.maxInitialToolTokens ?? base.maxInitialToolTokens,
	maxToolSurfaceBytes:
		override.maxToolSurfaceBytes ?? base.maxToolSurfaceBytes,
	routing: { ...base.routing, ...(override.routing ?? {}) },
});
