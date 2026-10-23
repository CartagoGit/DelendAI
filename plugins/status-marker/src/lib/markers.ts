/**
 * Canonical table for the mandatory coloured close marker.
 *
 * Every agent response MUST end with exactly one line of the form:
 *
 *   `<emoji> [<STATE>]`
 *   `<emoji> [<STATE>] — <short-reason>`     (when the state requires a reason)
 *
 * Constraints enforced here:
 *   - Reason is mandatory for: CAP, RE-PIVOT, CHECKPOINT-REQUIRED,
 *     REPAIR-NEEDED, BLOQUEADO.
 *   - The full line must be ≤ MAX_LINE_LEN (120) characters.
 *   - If a state requiring a reason is formatted without one, the helper
 *     inserts the literal token `<reason-missing>` so the violation is
 *     grep-able.
 *
 * The keys of {@link MARKERS} are the canonical state names; consumers
 * must use those exact strings (uppercased, ASCII, with hyphens for the
 * multi-word states). The helpers below keep the table as the single
 * source of truth.
 */

import type { IUserMarkerConfig } from './markers-config';

export type CloseMarker =
	| 'HECHO'
	| 'CAP'
	| 'RE-PIVOT'
	| 'CHECKPOINT-REQUIRED'
	| 'REPAIR-NEEDED'
	| 'BLOQUEADO'
	| 'SIN PROPUESTAS LIBRES'
	| 'SIN PROPUESTA DE NINGUN TIPO';

/** Maximum total length of a closing line, including emoji and reason. */
export const MAX_LINE_LEN = 120;

/** Separator between marker and reason: em-dash with surrounding spaces. */
export const CLOSE_SEPARATOR = ' — ';

/** Literal token inserted when a required reason is missing. */
export const REASON_MISSING_TOKEN = '<reason-missing>';

export interface IMarkerDef {
	readonly emoji: string;
	readonly requiresReason: boolean;
}

export const MARKERS: Readonly<Record<CloseMarker, IMarkerDef>> = {
	HECHO: { emoji: '🟩', requiresReason: false },
	CAP: { emoji: '🟨', requiresReason: true },
	'RE-PIVOT': { emoji: '🟧', requiresReason: true },
	'CHECKPOINT-REQUIRED': { emoji: '🟦', requiresReason: true },
	'REPAIR-NEEDED': { emoji: '🟫', requiresReason: true },
	BLOQUEADO: { emoji: '🟥', requiresReason: true },
	'SIN PROPUESTAS LIBRES': { emoji: '🟪', requiresReason: false },
	'SIN PROPUESTA DE NINGUN TIPO': { emoji: '⬜', requiresReason: false },
};

/** Ordered list of all states (stable order = declaration order). */
export const CLOSE_MARKER_STATES: readonly CloseMarker[] = Object.keys(
	MARKERS,
) as CloseMarker[];

/** Reverse lookup: emoji → state. Used by the validator. */
export const EMOJI_TO_STATE: ReadonlyMap<string, CloseMarker> = new Map(
	Object.entries(MARKERS).map(([state, def]) => [
		def.emoji,
		state as CloseMarker,
	]),
);

/**
 * Locales the renderer knows how to emit. The `es` locale always uses the
 * canonical state name as the bracket text (i.e. `[HECHO]`); other locales
 * are looked up in their table. Adding a new locale never touches the
 * {@link CloseMarker} type or any Zod enum — it's purely a presentation
 * concern. See proposal `f00070` for rationale.
 */
export type CloseMarkerLocale = 'es' | 'en';

/**
 * Per-locale bracket text. `es` re-uses the protocol state name verbatim,
 * which means existing callers see the exact same byte sequence they always
 * have. `en` maps to shorter, English-rendered tokens.
 */
export const MARKERS_BY_LOCALE: Readonly<
	Record<CloseMarkerLocale, Readonly<Record<CloseMarker, string>>>
> = {
	es: Object.fromEntries(CLOSE_MARKER_STATES.map((s) => [s, s])) as Readonly<
		Record<CloseMarker, string>
	>,
	en: {
		HECHO: 'DONE',
		CAP: 'HANDOFF',
		'RE-PIVOT': 'REPIVOT',
		'CHECKPOINT-REQUIRED': 'CHECKPOINT',
		'REPAIR-NEEDED': 'REPAIR',
		BLOQUEADO: 'BLOCKED',
		'SIN PROPUESTAS LIBRES': 'NO_FREE_PROPOSALS',
		'SIN PROPUESTA DE NINGUN TIPO': 'NO_WORK',
	},
};

/**
 * Options accepted by {@link formatCloseMarker}. Kept as an interface so
 * future flags (e.g. `omitTrailingSpace`) are non-breaking additions.
 */
export interface IFormatCloseMarkerOptions {
	/** Locale for the bracket text inside the rendered line. Default: 'es'. */
	readonly locale?: CloseMarkerLocale;
}

/**
 * Format a canonical close-marker line.
 *
 * - When the state requires a reason and `reason` is omitted, the literal
 *   `<reason-missing>` is appended so the convention is grep-able.
 * - When the resulting line exceeds {@link MAX_LINE_LEN}, it is truncated
 *   to 119 chars and a single `…` is appended.
 * - `opts.locale` selects the bracket text. `'es'` (default) emits the
 *   protocol state name verbatim — byte-identical to the legacy output.
 *   `'en'` renders a shorter English token (e.g. `[DONE]` instead of
 *   `[HECHO]`).
 */
export const formatCloseMarker = (
	state: CloseMarker,
	reason?: string,
	opts?: IFormatCloseMarkerOptions,
): string => {
	const def = MARKERS[state];
	const locale: CloseMarkerLocale = opts?.locale ?? 'es';
	const bracketText = MARKERS_BY_LOCALE[locale][state];
	const base = `${def.emoji} [${bracketText}]`;
	const body =
		def.requiresReason || reason
			? `${base}${CLOSE_SEPARATOR}${reason ?? REASON_MISSING_TOKEN}`
			: base;
	return body.length > MAX_LINE_LEN
		? `${body.slice(0, MAX_LINE_LEN - 1)}…`
		: body;
};

/**
 * Backwards-compatible alias used by other tools that imported
 * `formatLxAppCloseMarker`. Same signature, same output. Accepts the same
 * optional `opts` as {@link formatCloseMarker}.
 */
export const formatLxAppCloseMarker = (
	state: CloseMarker,
	reason?: string,
	opts?: IFormatCloseMarkerOptions,
): string => formatCloseMarker(state, reason, opts);

// --- user-configurable marker set (proposal f00071) ------------------------

/**
 * `HECHO` is the floor marker: any agent that ever produces output can
 * close with it. `disable` must never remove it (see {@link mergeMarkerTable}).
 */
export const FLOOR_STATE: CloseMarker = 'HECHO';

/**
 * A merged-table marker definition. Same shape as {@link IMarkerDef} plus the
 * per-locale bracket text and optional instruction that user markers may
 * supply. The state name itself is the map key in {@link IEffectiveMarkerTable}.
 */
export interface IEffectiveMarkerDef extends IMarkerDef {
	/** Bracket text per locale; locales absent here fall back to the state. */
	readonly locales: Readonly<Record<CloseMarkerLocale, string>>;
	/** Optional agent-facing guidance (when to emit this state). */
	readonly instruction?: string;
	/** Whether this state was declared by the host (`true`) or built in. */
	readonly userDefined: boolean;
}

/**
 * The effective close-marker table after merging the built-ins with the
 * host's `markers` config. The runtime (close tools, validator) reads this
 * instead of the static {@link MARKERS} so user states are first-class.
 */
export interface IEffectiveMarkerTable {
	/** State name → merged definition, in iteration order. */
	readonly markers: ReadonlyMap<string, IEffectiveMarkerDef>;
	/** Ordered state names (built-ins first, user `add`s appended). */
	readonly states: readonly string[];
	/** Reverse lookup emoji → state, rebuilt from the merged table. */
	readonly emojiToState: ReadonlyMap<string, string>;
}

/**
 * Shape of the host's `markers` config consumed by the merge. Re-exported
 * from {@link ./markers-config} (the Zod-inferred type) so the merge stays
 * in lock-step with the schema and avoids `exactOptionalPropertyTypes`
 * drift between a hand-rolled mirror and the parser output.
 */
export type IMergeUserConfig = IUserMarkerConfig;

/** Structured boot-time error envelope for a rejected merge. */
export interface IMergeError {
	readonly ok: false;
	readonly error: string;
	readonly detail?: string;
}

/** Known locales as a runtime list (keep in sync with {@link CloseMarkerLocale}). */
const KNOWN_LOCALES: readonly CloseMarkerLocale[] = ['es', 'en'];

/**
 * Build the per-locale bracket text for one state. Locales the caller does
 * not list fall back to `stateName` (matching the built-in `es` behaviour),
 * so a host that only declares `es` still gets a sensible `en` rendering.
 */
const resolveLocales = (
	stateName: string,
	supplied: Readonly<Record<string, string>> | undefined,
): Readonly<Record<CloseMarkerLocale, string>> => {
	const out = {} as Record<CloseMarkerLocale, string>;
	for (const locale of KNOWN_LOCALES) {
		out[locale] = supplied?.[locale] ?? stateName;
	}
	return out;
};

/**
 * Merge the built-in marker table with a host-supplied config and return the
 * effective table. Pure: same input always yields the same output, no I/O.
 *
 * Semantics (proposal f00071):
 *   - `add[i]` appends a new state at the end of the iteration order; its
 *     `id` and `emoji` must be unique across the merged table.
 *   - `disable[i]` removes the built-in `i`; `HECHO` (the floor) is not
 *     disablable, and disabling an unknown id is rejected.
 *   - `override[i]` patches the built-in `i`'s `instruction`, `locales` or
 *     `requiresReason`. `emoji` is never overridable.
 *
 * On any violation, returns a structured `{ ok: false, ... }` envelope so the
 * caller (the plugin boot) can fail with a clear message instead of throwing.
 */
export const mergeMarkerTable = (
	userCfg: IMergeUserConfig | undefined,
): IEffectiveMarkerTable | IMergeError => {
	const disabled = new Set(userCfg?.disable ?? []);
	const overrides = userCfg?.override ?? {};

	// Reject disabling unknown ids or the floor state up front.
	for (const id of disabled) {
		if (id === FLOOR_STATE) {
			return {
				ok: false,
				error: `cannot disable the floor state '${FLOOR_STATE}'`,
			};
		}
		if (!(id in MARKERS)) {
			return {
				ok: false,
				error: `disable references unknown built-in state '${id}'`,
			};
		}
	}

	// Reject overrides that target an unknown / disabled built-in.
	for (const id of Object.keys(overrides)) {
		if (!(id in MARKERS)) {
			return {
				ok: false,
				error: `override references unknown built-in state '${id}'`,
			};
		}
		if (disabled.has(id)) {
			return {
				ok: false,
				error: `override targets the disabled state '${id}'`,
			};
		}
	}

	const merged = new Map<string, IEffectiveMarkerDef>();

	// 1. Built-ins (minus disabled), patched by override.
	for (const state of CLOSE_MARKER_STATES) {
		if (disabled.has(state)) continue;
		const builtIn = MARKERS[state];
		const patch = overrides[state];
		const locales = {} as Record<CloseMarkerLocale, string>;
		for (const locale of KNOWN_LOCALES) {
			locales[locale] =
				patch?.locales?.[locale] ?? MARKERS_BY_LOCALE[locale][state];
		}
		merged.set(state, {
			emoji: builtIn.emoji,
			requiresReason: patch?.requiresReason ?? builtIn.requiresReason,
			locales,
			...(patch?.instruction !== undefined
				? { instruction: patch.instruction }
				: {}),
			userDefined: false,
		});
	}

	if (merged.size === 0) {
		return { ok: false, error: 'merged marker table would be empty' };
	}

	// 2. User-added states, appended in declared order.
	for (const def of userCfg?.add ?? []) {
		if (merged.has(def.id)) {
			return {
				ok: false,
				error: `added marker '${def.id}' collides with an existing state id`,
			};
		}
		const emojiClash = [...merged.values()].some(
			(m) => m.emoji === def.emoji,
		);
		if (emojiClash) {
			return {
				ok: false,
				error: `added marker '${def.id}' uses emoji '${def.emoji}' already in the table`,
			};
		}
		merged.set(def.id, {
			emoji: def.emoji,
			requiresReason: def.requiresReason,
			locales: resolveLocales(def.id, def.locales),
			...(def.instruction !== undefined
				? { instruction: def.instruction }
				: {}),
			userDefined: true,
		});
	}

	const states = [...merged.keys()];
	const emojiToState = new Map<string, string>(
		[...merged.entries()].map(([state, def]) => [def.emoji, state]),
	);

	return { markers: merged, states, emojiToState };
};

/**
 * The built-in table expressed as an {@link IEffectiveMarkerTable}. Used as
 * the default when a host supplies no `markers` config — byte-identical
 * behaviour to the legacy static table.
 */
export const BUILTIN_MARKER_TABLE: IEffectiveMarkerTable = mergeMarkerTable(
	undefined,
) as IEffectiveMarkerTable;

/**
 * Format a close-marker line from an effective (merged) table. Generalises
 * {@link formatCloseMarker} to states that may not be built-in. For a
 * built-in state on the built-in table this returns byte-identical output to
 * {@link formatCloseMarker}; the canonical helper stays the public, typed
 * entry point for the 8 built-ins.
 *
 * Returns `undefined` when `state` is not present in `table` so the caller
 * can surface a structured error rather than emit a malformed line.
 */
export const formatEffectiveMarker = (
	table: IEffectiveMarkerTable,
	state: string,
	reason?: string,
	opts?: IFormatCloseMarkerOptions,
): string | undefined => {
	const def = table.markers.get(state);
	if (def === undefined) return undefined;
	const locale: CloseMarkerLocale = opts?.locale ?? 'es';
	const bracketText = def.locales[locale];
	const base = `${def.emoji} [${bracketText}]`;
	const body =
		def.requiresReason || reason
			? `${base}${CLOSE_SEPARATOR}${reason ?? REASON_MISSING_TOKEN}`
			: base;
	return body.length > MAX_LINE_LEN
		? `${body.slice(0, MAX_LINE_LEN - 1)}…`
		: body;
};
