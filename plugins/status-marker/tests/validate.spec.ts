import { describe, expect, it } from 'vitest';

import {
	splitLastLine,
	validateCloseMarker,
	validateResponseClose,
} from '../src/lib/validate';
import {
	CLOSE_MARKER_STATES,
	formatCloseMarker,
	MAX_LINE_LEN,
} from '../src/lib/markers';

describe('validate — single line', () => {
	it('accepts every state in the canonical table', () => {
		for (const state of CLOSE_MARKER_STATES) {
			const line = formatCloseMarker(
				state,
				state === 'HECHO' ? undefined : 'x',
			);
			const result = validateCloseMarker(line);
			expect(result.ok, `state ${state} should validate: ${line}`).toBe(
				true,
			);
		}
	});

	it('rejects an empty line as missing', () => {
		expect(validateCloseMarker('')).toEqual({
			ok: false,
			violation: 'missing',
		});
		expect(validateCloseMarker('   ')).toEqual({
			ok: false,
			violation: 'missing',
		});
	});

	it('rejects text without a recognised emoji as bad-format', () => {
		expect(validateCloseMarker('foo').ok).toBe(false);
		expect(validateCloseMarker('foo').violation).toBe('bad-format');
	});

	it('rejects the 5 reason-required states when no reason is supplied', () => {
		const required = [
			'CAP',
			'RE-PIVOT',
			'CHECKPOINT-REQUIRED',
			'REPAIR-NEEDED',
			'BLOQUEADO',
		] as const;
		for (const state of required) {
			const line = formatCloseMarker(state); // reason intentionally omitted
			const result = validateCloseMarker(line);
			expect(result.ok, `${state} should fail without reason`).toBe(
				false,
			);
			expect(result.violations).toContain('reason-missing');
		}
	});

	it('reports too-long when the line exceeds MAX_LINE_LEN', () => {
		const long = '🟨 [CAP] — ' + 'x'.repeat(MAX_LINE_LEN);
		const result = validateCloseMarker(long);
		expect(result.ok).toBe(false);
		expect(result.violations ?? []).toContain('too-long');
	});

	it('tolerates surrounding whitespace and CRLF', () => {
		const line = formatCloseMarker('HECHO');
		expect(validateCloseMarker(`  \t${line}\r\n`).ok).toBe(true);
	});
});

describe('validate — full response', () => {
	it('accepts a response whose final line is the marker', () => {
		const text = 'Algo de prosa antes...\n\n' + formatCloseMarker('HECHO');
		expect(validateResponseClose(text).ok).toBe(true);
	});

	it('rejects extra prose after the marker', () => {
		const text =
			'Prosa\n' + formatCloseMarker('HECHO') + '\nY más prosa después';
		const result = validateResponseClose(text);
		expect(result.ok).toBe(false);
		expect(result.violations).toContain('bad-format');
	});

	it('reports missing when the response is empty', () => {
		expect(validateResponseClose('').violation).toBe('missing');
		expect(validateResponseClose('   \n   ').violation).toBe('missing');
	});
});

describe('splitLastLine', () => {
	it('returns the trimmed last line', () => {
		const r = splitLastLine('a\nb\nc  ');
		expect(r.lastLine).toBe('c');
		expect(r.hasExtraProse).toBe(false);
	});
});
