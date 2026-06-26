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
