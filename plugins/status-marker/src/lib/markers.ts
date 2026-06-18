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
 * Format a canonical close-marker line.
 *
 * - When the state requires a reason and `reason` is omitted, the literal
 *   `<reason-missing>` is appended so the convention is grep-able.
 * - When the resulting line exceeds {@link MAX_LINE_LEN}, it is truncated
 *   to 119 chars and a single `…` is appended.
 */
export const formatCloseMarker = (
	state: CloseMarker,
	reason?: string,
): string => {
	const def = MARKERS[state];
	const base = `${def.emoji} [${state}]`;
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
 * `formatLxAppCloseMarker`. Same signature, same output.
 */
export const formatLxAppCloseMarker = formatCloseMarker;
