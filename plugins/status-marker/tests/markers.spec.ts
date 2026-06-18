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

describe('markers — canonical table', () => {
	it('declares the 8 states in stable order', () => {
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

	it('maps each emoji to its state (unique)', () => {
		const emojis = Object.values(MARKERS).map((d) => d.emoji);
		expect(new Set(emojis).size).toBe(emojis.length);
		for (const def of Object.values(MARKERS)) {
			expect(EMOJI_TO_STATE.get(def.emoji)).toBeDefined();
		}
	});

	it('marks the 5 reason-required states and the 3 optional ones', () => {
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

describe('markers — formatCloseMarker', () => {
	it('renders HECHO without reason', () => {
		expect(formatCloseMarker('HECHO')).toBe('🟩 [HECHO]');
	});

	it('appends the reason with the U+2014 separator', () => {
		expect(
			formatCloseMarker('CAP', 'slice cerrada, validación pendiente'),
		).toBe(`🟨 [CAP]${CLOSE_SEPARATOR}slice cerrada, validación pendiente`);
	});

	it('inserts <reason-missing> when the state requires one but none is given', () => {
		const line = formatCloseMarker('BLOQUEADO');
		expect(line.endsWith(REASON_MISSING_TOKEN)).toBe(true);
		expect(line.startsWith('🟥 [BLOQUEADO]')).toBe(true);
	});

	it('keeps the optional reason when the state does not require one', () => {
		expect(formatCloseMarker('HECHO', 'opcional')).toBe(
			'🟩 [HECHO] — opcional',
		);
	});

	it('truncates to MAX_LINE_LEN with a trailing … when the reason overflows', () => {
		const long = 'x'.repeat(200);
		const line = formatCloseMarker('CAP', long);
		expect(line.length).toBeLessThanOrEqual(MAX_LINE_LEN);
		expect(line.endsWith('…')).toBe(true);
	});

	it('exports formatLxAppCloseMarker as an alias with identical output', () => {
		const a = formatCloseMarker('HECHO');
		const b = formatLxAppCloseMarker('HECHO');
		expect(a).toBe(b);
	});
});
