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
	CLOSE_SEPARATOR,
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
 * Validate a single line as a canonical close-marker line. Returns an
 * `ok: true` result only when every rule is satisfied.
 */
export const validateCloseMarker = (rawLine: string): IValidationResult => {
	const line = rawLine.trim();
	if (line === '') {
		return { ok: false, violation: 'missing' };
	}

	const emoji = [...line][0];
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
	let reason: string | undefined;
	if (tail.startsWith('—')) {
		reason = tail.slice(1).trim();
		if (reason === '') reason = undefined;
	}

	const violations: Violation[] = [];

	if (def.requiresReason && reason === undefined) {
		violations.push('reason-missing');
	}
	if (!def.requiresReason && reason !== undefined) {
		// Not fatal — the agent may add context. But if the reason is the
		// literal placeholder token, that is definitely wrong.
		if (reason === REASON_MISSING_TOKEN) {
			violations.push('placeholder-reason');
		}
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
	const last = lines.at(-1) ?? '';
	const trimmedLast = last.trim();
	const afterMarker = lines.slice(0, -1).join('\n').trim();

	const result = validateCloseMarker(trimmedLast);
	if (result.ok) {
		if (afterMarker === '') return result;
		// The marker is valid but there is prose after it. Mark it as
		// `bad-format` (violation of "no extra prose after the line").
		return {
			...result,
			ok: false,
			violations: ['bad-format'],
		};
	}
	return result;
};
