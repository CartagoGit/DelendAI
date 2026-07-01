import { describe, expect, it } from 'vitest';

import {
	BUILTIN_MARKER_TABLE,
	CLOSE_MARKER_STATES,
	CLOSE_SEPARATOR,
	EMOJI_TO_STATE,
	formatCloseMarker,
	formatEffectiveMarker,
	formatLxAppCloseMarker,
	type IEffectiveMarkerTable,
	type IMergeError,
	MARKERS,
	MARKERS_BY_LOCALE,
	MAX_LINE_LEN,
	mergeMarkerTable,
	REASON_MISSING_TOKEN,
	type CloseMarker,
	type CloseMarkerLocale,
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

/**
 * Bilingual rendering for `formatCloseMarker`. Proposal `f00070` adds an
 * optional `opts.locale` parameter that selects between the canonical
 * Spanish-bracket text (default) and the shorter English tokens. The
 * validator is intentionally locale-agnostic — it parses by emoji + the
 * `<emoji> [<bracket-text>]` shape — so both renderings validate cleanly.
 */
describe('markers — bilingual rendering (f00070)', async () => {
	// One assertion per state, EN locale, no reason supplied. For the 5
	// reason-required states, the helper still inserts `<reason-missing>`
	// but the BRACKET text is what we lock in here.
	const EN_TOKEN_BY_STATE: Record<CloseMarker, string> = {
		HECHO: '🟩 [DONE]',
		CAP: '🟨 [HANDOFF]',
		'RE-PIVOT': '🟧 [REPIVOT]',
		'CHECKPOINT-REQUIRED': '🟦 [CHECKPOINT]',
		'REPAIR-NEEDED': '🟫 [REPAIR]',
		BLOQUEADO: '🟥 [BLOCKED]',
		'SIN PROPUESTAS LIBRES': '🟪 [NO_FREE_PROPOSALS]',
		'SIN PROPUESTA DE NINGUN TIPO': '⬜ [NO_WORK]',
	};

	for (const state of CLOSE_MARKER_STATES) {
		it(`[${state}] renders the EN token when locale="en" and no reason is supplied`, async () => {
			const line = formatCloseMarker(state, undefined, { locale: 'en' });
			if (MARKERS[state].requiresReason) {
				// Required-reason + missing reason: EN bracket + separator + placeholder.
				expect(line).toBe(
					`${EN_TOKEN_BY_STATE[state]}${CLOSE_SEPARATOR}${REASON_MISSING_TOKEN}`,
				);
			} else {
				// Optional-reason + missing reason: bare EN token.
				expect(line).toBe(EN_TOKEN_BY_STATE[state]);
			}
		});
	}

	it('keeps the canonical ES bracket by default (opts omitted)', async () => {
		expect(formatCloseMarker('HECHO')).toBe('🟩 [HECHO]');
		expect(formatCloseMarker('CAP', 'en revisión')).toBe(
			`🟨 [CAP]${CLOSE_SEPARATOR}en revisión`,
		);
	});

	it('keeps the canonical ES bracket when opts.locale is explicitly "es"', async () => {
		expect(formatCloseMarker('HECHO', undefined, { locale: 'es' })).toBe(
			'🟩 [HECHO]',
		);
		expect(formatCloseMarker('CAP', 'en revisión', { locale: 'es' })).toBe(
			`🟨 [CAP]${CLOSE_SEPARATOR}en revisión`,
		);
	});

	it('preserves the "[STATE] — <reason>" shape in EN when a reason is supplied', async () => {
		expect(
			formatCloseMarker('CAP', 'slice handed off', { locale: 'en' }),
		).toBe(`🟨 [HANDOFF]${CLOSE_SEPARATOR}slice handed off`);
		expect(
			formatCloseMarker('RE-PIVOT', 'new direction chosen', {
				locale: 'en',
			}),
		).toBe(`🟧 [REPIVOT]${CLOSE_SEPARATOR}new direction chosen`);
	});

	it('preserves the "[STATE] — <reason>" shape in ES when a reason is supplied', async () => {
		expect(formatCloseMarker('CAP', 'slice handed off')).toBe(
			`🟨 [CAP]${CLOSE_SEPARATOR}slice handed off`,
		);
		expect(formatCloseMarker('RE-PIVOT', 'new direction chosen')).toBe(
			`🟧 [RE-PIVOT]${CLOSE_SEPARATOR}new direction chosen`,
		);
	});

	it('truncates EN lines that overflow MAX_LINE_LEN exactly like ES', async () => {
		const long = 'x'.repeat(200);
		const es = formatCloseMarker('CAP', long);
		const en = formatCloseMarker('CAP', long, { locale: 'en' });
		expect(es.length).toBeLessThanOrEqual(MAX_LINE_LEN);
		expect(en.length).toBeLessThanOrEqual(MAX_LINE_LEN);
		expect(es.endsWith('…')).toBe(true);
		expect(en.endsWith('…')).toBe(true);
	});

	it('exposes every locale × state pair in MARKERS_BY_LOCALE', async () => {
		const locales: CloseMarkerLocale[] = ['es', 'en'];
		for (const locale of locales) {
			const table = MARKERS_BY_LOCALE[locale];
			for (const state of CLOSE_MARKER_STATES) {
				expect(
					typeof table[state],
					`${locale}.${state} must be a string`,
				).toBe('string');
				expect(table[state].length).toBeGreaterThan(0);
			}
		}
	});

	it('routes EN rendering through formatLxAppCloseMarker identically', async () => {
		const a = formatCloseMarker('HECHO', undefined, { locale: 'en' });
		const b = formatLxAppCloseMarker('HECHO', undefined, { locale: 'en' });
		expect(a).toBe(b);
		expect(a).toBe('🟩 [DONE]');
	});
});

/**
 * User-configurable marker set (proposal f00071). `mergeMarkerTable` is the
 * pure heart: built-in ⊕ user-set ⊕ overrides. These tests lock the merge
 * semantics and the structured-error envelope, plus the rendering through
 * `formatEffectiveMarker`.
 */
const asTable = (
	merged: IEffectiveMarkerTable | IMergeError,
): IEffectiveMarkerTable => {
	if ('ok' in merged && merged.ok === false) {
		throw new Error(`expected a table, got error: ${merged.error}`);
	}
	return merged as IEffectiveMarkerTable;
};

describe('markers — mergeMarkerTable (f00071)', async () => {
	it('returns the built-in 8-state table verbatim when no config is given', async () => {
		const t = asTable(mergeMarkerTable(undefined));
		expect(t.states).toEqual(CLOSE_MARKER_STATES);
		expect([...t.emojiToState.entries()].length).toBe(8);
		for (const s of CLOSE_MARKER_STATES) {
			expect(t.markers.get(s)?.emoji).toBe(MARKERS[s].emoji);
			expect(t.markers.get(s)?.requiresReason).toBe(
				MARKERS[s].requiresReason,
			);
			expect(t.markers.get(s)?.userDefined).toBe(false);
		}
	});

	it('BUILTIN_MARKER_TABLE matches a fresh merge with no config', async () => {
		expect(BUILTIN_MARKER_TABLE.states).toEqual(CLOSE_MARKER_STATES);
	});

	it('appends a non-colliding marker after the built-ins', async () => {
		const t = asTable(
			mergeMarkerTable({
				add: [
					{
						id: 'REVIEW',
						emoji: '🔷',
						requiresReason: true,
						locales: { es: 'REVISIÓN', en: 'REVIEW' },
						instruction: 'after a review',
					},
				],
			}),
		);
		expect(t.states.at(-1)).toBe('REVIEW');
		expect(t.states.length).toBe(9);
		const def = t.markers.get('REVIEW');
		expect(def?.userDefined).toBe(true);
		expect(def?.emoji).toBe('🔷');
		expect(def?.requiresReason).toBe(true);
		expect(def?.instruction).toBe('after a review');
		expect(t.emojiToState.get('🔷')).toBe('REVIEW');
	});

	it('falls back to the state name for locales a user marker omits', async () => {
		const t = asTable(
			mergeMarkerTable({
				add: [
					{
						id: 'DEFERRED',
						emoji: '⏸️',
						requiresReason: true,
						locales: { es: 'APLAZADO' },
					},
				],
			}),
		);
		const def = t.markers.get('DEFERRED');
		expect(def?.locales.es).toBe('APLAZADO');
		// EN omitted → falls back to the state name.
		expect(def?.locales.en).toBe('DEFERRED');
	});

	it('rejects an added marker that collides with a built-in emoji', async () => {
		const merged = mergeMarkerTable({
			add: [{ id: 'REVIEW', emoji: '🟩', requiresReason: false }],
		});
		expect('ok' in merged && merged.ok === false).toBe(true);
		expect((merged as IMergeError).error).toMatch(/emoji/);
	});

	it('rejects an added marker that collides with a built-in id', async () => {
		const merged = mergeMarkerTable({
			add: [{ id: 'HECHO', emoji: '🔷', requiresReason: false }],
		});
		expect('ok' in merged && merged.ok === false).toBe(true);
		expect((merged as IMergeError).error).toMatch(/collides|existing/);
	});

	it('disable removes a built-in state', async () => {
		const t = asTable(
			mergeMarkerTable({ disable: ['SIN PROPUESTA DE NINGUN TIPO'] }),
		);
		expect(t.states).not.toContain('SIN PROPUESTA DE NINGUN TIPO');
		expect(t.states.length).toBe(7);
		expect(t.emojiToState.get('⬜')).toBeUndefined();
	});

	it('refuses to disable the floor state HECHO', async () => {
		const merged = mergeMarkerTable({ disable: ['HECHO'] });
		expect('ok' in merged && merged.ok === false).toBe(true);
		expect((merged as IMergeError).error).toMatch(/HECHO|floor/);
	});

	it('refuses to disable an unknown built-in id', async () => {
		const merged = mergeMarkerTable({ disable: ['NOPE'] });
		expect('ok' in merged && merged.ok === false).toBe(true);
		expect((merged as IMergeError).error).toMatch(/unknown/);
	});

	it('override patches instruction / requiresReason but never emoji', async () => {
		const t = asTable(
			mergeMarkerTable({
				override: {
					BLOQUEADO: {
						instruction: 'external dep blocks the slice',
						requiresReason: false,
					},
				},
			}),
		);
		const def = t.markers.get('BLOQUEADO');
		expect(def?.instruction).toBe('external dep blocks the slice');
		expect(def?.requiresReason).toBe(false);
		// Emoji is part of the wire contract — unchanged.
		expect(def?.emoji).toBe(MARKERS.BLOQUEADO.emoji);
	});

	it('override can patch per-locale bracket text', async () => {
		const t = asTable(
			mergeMarkerTable({
				override: { CAP: { locales: { en: 'PAUSED' } } },
			}),
		);
		expect(t.markers.get('CAP')?.locales.en).toBe('PAUSED');
		// ES untouched.
		expect(t.markers.get('CAP')?.locales.es).toBe('CAP');
	});

	it('rejects an override targeting an unknown built-in id', async () => {
		const merged = mergeMarkerTable({ override: { NOPE: {} } });
		expect('ok' in merged && merged.ok === false).toBe(true);
		expect((merged as IMergeError).error).toMatch(/unknown/);
	});
});

describe('markers — formatEffectiveMarker (f00071)', async () => {
	it('renders a built-in state byte-identical to formatCloseMarker', async () => {
		for (const s of CLOSE_MARKER_STATES) {
			expect(formatEffectiveMarker(BUILTIN_MARKER_TABLE, s)).toBe(
				formatCloseMarker(s),
			);
			expect(
				formatEffectiveMarker(BUILTIN_MARKER_TABLE, s, undefined, {
					locale: 'en',
				}),
			).toBe(formatCloseMarker(s, undefined, { locale: 'en' }));
		}
	});

	it('renders a user-added state with its declared bracket + emoji', async () => {
		const t = asTable(
			mergeMarkerTable({
				add: [
					{
						id: 'REVIEW',
						emoji: '🔷',
						requiresReason: true,
						locales: { es: 'REVISIÓN', en: 'REVIEW' },
					},
				],
			}),
		);
		expect(formatEffectiveMarker(t, 'REVIEW', 'lgtm')).toBe(
			`🔷 [REVISIÓN]${CLOSE_SEPARATOR}lgtm`,
		);
		expect(
			formatEffectiveMarker(t, 'REVIEW', 'lgtm', { locale: 'en' }),
		).toBe(`🔷 [REVIEW]${CLOSE_SEPARATOR}lgtm`);
	});

	it('returns undefined for a state not in the table', async () => {
		expect(
			formatEffectiveMarker(BUILTIN_MARKER_TABLE, 'NOT_A_STATE'),
		).toBeUndefined();
	});
});
