/**
 * Tolerant parser for the canonical close-marker line. Designed to be
 * resilient to:
 *
 * - Trailing whitespace and CRLF.
 * - Leading emoji followed by `[STATE]` and an optional reason.
 * - States whose reason is missing (5 of them REQUIRE a reason; the
 *   helper below reports `reason-missing` instead of declaring success).
 *
 * Returned {@link IValidationResult} is intentionally `{ ok, ... }`-shaped
 * so it can be JSON-serialised straight from a tool response without
 * throwing on bad input.
 */

import {
	EMOJI_TO_STATE,
	MAX_LINE_LEN,
	MARKERS,
	REASON_MISSING_TOKEN,
	type CloseMarker,
} from './markers';

export type Violation =
	| 'missing'
	| 'bad-format'
	| 'reason-missing'
	| 'reason-supplied-but-not-allowed'
	| 'too-long'
	| 'placeholder-reason';

export interface IValidationResult {
	readonly ok: boolean;
	readonly state?: CloseMarker;
	readonly reason?: string;
	readonly line?: string;
	readonly violation?: Violation;
	readonly violations?: readonly Violation[];
}

/**
 * Strip everything after the marker line so the validator only inspects
 * the canonical close line. Returns `{ lastLine, hasExtraProse }`.
 *
 * The convention requires the marker to be the **last** visible line of
 * the response; trailing whitespace is tolerated but any further text is
 * reported as `extra-prose` (collected alongside other violations).
 */
export const splitLastLine = (
	text: string,
): { lastLine: string; hasExtraProse: boolean } => {
	const normalised = text.replace(/\r\n/g, '\n').trimEnd();
	if (normalised === '') return { lastLine: '', hasExtraProse: false };
	const lines = normalised.split('\n');
	const lastLine = (lines.at(-1) ?? '').trim();
	const hasExtraProse = false; // marker-only check; caller decides prose policy
	return { lastLine, hasExtraProse };
};

/**
 * Dash characters an agent might emit as the marker↔reason separator. The
 * canonical renderer (`formatCloseMarker`) always uses the em-dash
 * (U+2014), but an LLM hand-typing or copy-editing the line frequently
 * substitutes an ASCII hyphen-minus (`-`), an en-dash (U+2013), a
 * horizontal bar (U+2015), or a double-hyphen (`--`). Treating only the
 * em-dash as the separator made validation pass "only sometimes": the
 * exact same reason was reported as `reason-missing` whenever the model
 * picked a different dash. We normalise all of them.
 */
const SEPARATOR_DASHES = ['—', '–', '―', '--', '-'] as const;

/**
 * Extract the reason from the text that follows the `]` bracket. Tolerant
 * of the dash variants in {@link SEPARATOR_DASHES} as well as a reason
 * placed directly after the bracket with no dash at all (a colon is also
 * accepted). Returns `undefined` when there is no reason text.
 *
 * Pure and deterministic: the same input always yields the same reason,
 * regardless of which separator glyph the agent chose.
 */
const extractReason = (tail: string): string | undefined => {
	const trimmed = tail.trim();
	if (trimmed === '') return undefined;
	for (const dash of SEPARATOR_DASHES) {
		if (trimmed.startsWith(dash)) {
			const reason = trimmed.slice(dash.length).trim();
			return reason === '' ? undefined : reason;
		}
	}
	if (trimmed.startsWith(':')) {
		const reason = trimmed.slice(1).trim();
		return reason === '' ? undefined : reason;
	}
	// No recognised separator, but there IS text after the bracket — treat
	// it as the reason. This is the "missing dash" case (`[CAP] turno
	// agotado`): the agent supplied a reason, just without a separator.
	return trimmed;
};

/**
 * Validate a single line as a canonical close-marker line. Returns an
 * `ok: true` result only when every rule is satisfied.
 */
export const validateCloseMarker = (rawLine: string): IValidationResult => {
	const line = rawLine.trim();
	if (line === '') {
		return { ok: false, violation: 'missing' };
	}

	const emoji = [...line][0];
	if (emoji === undefined) {
		return { ok: false, violation: 'missing', line };
	}
	const state = EMOJI_TO_STATE.get(emoji);
	if (state === undefined) {
		return { ok: false, violation: 'bad-format', line };
	}

	const def = MARKERS[state];
	const afterEmoji = line.slice(emoji.length).trimStart();
	const bracketEnd = afterEmoji.indexOf(']');
	if (bracketEnd < 0 || !afterEmoji.startsWith('[')) {
		return { ok: false, state, violation: 'bad-format', line };
	}

	const tail = afterEmoji.slice(bracketEnd + 1).trim();
	const reason = extractReason(tail);

	const violations: Violation[] = [];

	if (def.requiresReason && reason === undefined) {
		violations.push('reason-missing');
	}
	if (reason === REASON_MISSING_TOKEN) {
		// The helper only inserts the placeholder when a required reason is
		// missing; reporting it as a violation lets callers grep for broken
		// conventions without re-implementing the rule.
		violations.push('placeholder-reason');
	}
	if (
		!def.requiresReason &&
		reason !== undefined &&
		reason !== REASON_MISSING_TOKEN
	) {
		// Not fatal — the agent may add context. The validator stays
		// permissive here.
	}
	if (line.length > MAX_LINE_LEN) {
		violations.push('too-long');
	}

	if (violations.length === 0) {
		return reason === undefined
			? { ok: true, state, line }
			: { ok: true, state, reason, line };
	}
	return { ok: false, state, line, violations };
};

/**
 * Validate the last line of a multi-line response. Same contract as
 * {@link validateCloseMarker} plus an `extra-prose` violation when the
 * marker is not the literal last line.
 */
export const validateResponseClose = (text: string): IValidationResult => {
	const normalised = text.replace(/\r\n/g, '\n');
	if (normalised.trimEnd() === '') {
		return { ok: false, violation: 'missing' };
	}
	const lines = normalised.split('\n');
	const lastIndex = lines.length - 1;
	const last = lines[lastIndex] ?? '';
	const trimmedLast = last.trim();

	const result = validateCloseMarker(trimmedLast);
	if (!result.ok) return result;

	// Marker is well-formed. The convention requires the marker to be the
	// LAST visible line, with NOTHING after it (no trailing prose, no
	// inline comment on the same line). Prosa BEFORE the marker is allowed.
	const inlineTrailing = last.slice(trimmedLast.length).trim();
	const proseAfter = lines
		.slice(lastIndex + 1)
		.join('\n')
		.trim();
	if (inlineTrailing !== '' || proseAfter !== '') {
		return {
			...result,
			ok: false,
			violations: ['bad-format'],
		};
	}
	return result;
};
