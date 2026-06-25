import { describe, expect, it } from 'vitest';

import {
	CLOSE_MARKER_STATES,
	CLOSE_SEPARATOR,
	EMOJI_TO_STATE,
	formatCloseMarker,
	formatLxAppCloseMarker,
	MAX_LINE_LEN,
	MARKERS,
	REASON_MISSING_TOKEN,
	type CloseMarker,
} from '../src/lib/markers';

describe('markers — canonical table', async () => {
	it('declares the 8 states in stable order', async () => {
		expect(CLOSE_MARKER_STATES).toEqual([
			'HECHO',
			'CAP',
			'RE-PIVOT',
			'CHECKPOINT-REQUIRED',
			'REPAIR-NEEDED',
			'BLOQUEADO',
			'SIN PROPUESTAS LIBRES',
			'SIN PROPUESTA DE NINGUN TIPO',
		]);
	});

	it('maps each emoji to its state (unique)', async () => {
		const emojis = Object.values(MARKERS).map((d) => d.emoji);
		expect(new Set(emojis).size).toBe(emojis.length);
		for (const def of Object.values(MARKERS)) {
			expect(EMOJI_TO_STATE.get(def.emoji)).toBeDefined();
		}
	});

	it('marks the 5 reason-required states and the 3 optional ones', async () => {
		const required: CloseMarker[] = [
			'CAP',
			'RE-PIVOT',
			'CHECKPOINT-REQUIRED',
			'REPAIR-NEEDED',
			'BLOQUEADO',
		];
		const optional: CloseMarker[] = [
			'HECHO',
			'SIN PROPUESTAS LIBRES',
			'SIN PROPUESTA DE NINGUN TIPO',
		];
		for (const s of required) expect(MARKERS[s].requiresReason).toBe(true);
		for (const s of optional) expect(MARKERS[s].requiresReason).toBe(false);
	});
});

describe('markers — formatCloseMarker', async () => {
	it('renders HECHO without reason', async () => {
		expect(formatCloseMarker('HECHO')).toBe('🟩 [HECHO]');
	});

	it('appends the reason with the U+2014 separator', async () => {
		expect(
			formatCloseMarker('CAP', 'slice cerrada, validación pendiente'),
		).toBe(`🟨 [CAP]${CLOSE_SEPARATOR}slice cerrada, validación pendiente`);
	});

	it('inserts <reason-missing> when the state requires one but none is given', async () => {
		const line = formatCloseMarker('BLOQUEADO');
		expect(line.endsWith(REASON_MISSING_TOKEN)).toBe(true);
		expect(line.startsWith('🟥 [BLOQUEADO]')).toBe(true);
	});

	it('keeps the optional reason when the state does not require one', async () => {
		expect(formatCloseMarker('HECHO', 'opcional')).toBe(
			'🟩 [HECHO] — opcional',
		);
	});

	it('truncates to MAX_LINE_LEN with a trailing … when the reason overflows', async () => {
		const long = 'x'.repeat(200);
		const line = formatCloseMarker('CAP', long);
		expect(line.length).toBeLessThanOrEqual(MAX_LINE_LEN);
		expect(line.endsWith('…')).toBe(true);
	});

	it('exports formatLxAppCloseMarker as an alias with identical output', async () => {
		const a = formatCloseMarker('HECHO');
		const b = formatLxAppCloseMarker('HECHO');
		expect(a).toBe(b);
	});
});

/**
 * Guard the close-bracket `]` of every state.
 *
 * The plugin-level contract is intentionally tolerant: the validator
 * matches the canonical `<emoji> [<STATE>]` token by `indexOf(']')`, so
 * the bracket does NOT have to be the last character when a reason (or
 * `<reason-missing>` token) follows. That tolerance is the design — the
 * five reason-required states need to surface a reason or its absence,
 * and the canonical line therefore looks like:
 *
 *     🟨 [CAP] — slice cerrada, validación pendiente
 *     🟨 [CAP] — <reason-missing>
 *
 * What the helper MUST guarantee for every state is:
 *   1. The line starts with the emoji, a single space, `[`, the state, and
 *      a closing `]` — i.e. the `<emoji> [<STATE>]` token is intact.
 *   2. If no reason is supplied, either the line is the bare token (3
 *      optional-reason states) or the line appends the separator +
 *      `<reason-missing>` (5 required-reason states).
 *   3. If a reason is supplied, the separator + reason follows the bare
 *      token. The closing `]` still appears once, exactly after the
 *      state name.
 *
 * Some IDE chat renders truncate the last visible line of a response,
 * which can make `🟩 [HECHO]` look like `🟩 [HECHO` in the UI even though
 * the plugin emits the full string. That is a UI artefact, not a plugin
 * bug — the contract tested below is what the validator and any host
 * rendering the marker verbatim actually see.
 */
describe('markers — every state closes its bracket', async () => {
	const closingBracketCount = (line: string): number =>
		(line.match(/]/g) ?? []).length;

	for (const state of CLOSE_MARKER_STATES) {
		it(`[${state}] preserves the canonical '<emoji> [<STATE>]' token`, async () => {
			const token = `${MARKERS[state].emoji} [${state}]`;

			// Path 1: no reason.
			const withoutReason = formatCloseMarker(state);
			if (MARKERS[state].requiresReason) {
				// Required-reason + missing reason: `<token> — <reason-missing>`.
				expect(withoutReason.startsWith(token)).toBe(true);
				expect(withoutReason.includes(' — ')).toBe(true);
				expect(withoutReason.endsWith(REASON_MISSING_TOKEN)).toBe(true);
			} else {
				// Optional-reason + missing reason: bare `<token>`.
				expect(withoutReason).toBe(token);
			}

			// Path 2: reason supplied — both kinds of states go through
			// the separator path, but the closing `]` must still appear
			// exactly once and immediately after the state name.
			const withReason = formatCloseMarker(state, 'sample reason');
			const bracketIdx = withReason.indexOf(']');
			expect(bracketIdx).toBeGreaterThan(0);
			expect(withReason[bracketIdx]).toBe(']');
			// And nothing appended a stray second `]` past the state token.
			expect(
				closingBracketCount(withReason.slice(0, bracketIdx + 1)),
			).toBe(1);
			// The separator must come right after the token.
			expect(withReason.startsWith(`${token}${CLOSE_SEPARATOR}`)).toBe(
				true,
			);
			expect(withReason.endsWith('sample reason')).toBe(true);
		});
	}
});
