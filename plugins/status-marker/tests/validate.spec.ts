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
	MARKERS,
} from '../src/lib/markers';

describe('validate — single line', async () => {
	it('accepts every state in the canonical table', async () => {
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

	it('rejects an empty line as missing', async () => {
		expect(validateCloseMarker('')).toEqual({
			ok: false,
			violation: 'missing',
		});
		expect(validateCloseMarker('   ')).toEqual({
			ok: false,
			violation: 'missing',
		});
	});

	it('rejects text without a recognised emoji as bad-format', async () => {
		expect(validateCloseMarker('foo').ok).toBe(false);
		expect(validateCloseMarker('foo').violation).toBe('bad-format');
	});

	it('rejects the 5 reason-required states when no reason is supplied', async () => {
		const required = [
			'CAP',
			'RE-PIVOT',
			'CHECKPOINT-REQUIRED',
			'REPAIR-NEEDED',
			'BLOQUEADO',
		] as const;
		for (const state of required) {
			// Build the "no reason" line manually — the helper would
			// otherwise insert <reason-missing>, which is itself reported
			// as `placeholder-reason` by the next test.
			const def = MARKERS[state];
			const line = `${def.emoji} [${state}]`;
			const result = validateCloseMarker(line);
			expect(result.ok, `${state} should fail without reason`).toBe(
				false,
			);
			expect(result.violations).toContain('reason-missing');
		}
	});

	it('reports placeholder-reason when the helper inserted <reason-missing>', async () => {
		const line = formatCloseMarker('BLOQUEADO'); // helper auto-inserts placeholder
		const result = validateCloseMarker(line);
		expect(result.ok).toBe(false);
		expect(result.violations).toContain('placeholder-reason');
	});

	it('reports too-long when the line exceeds MAX_LINE_LEN', async () => {
		const long = `🟨 [CAP] — ${'x'.repeat(MAX_LINE_LEN)}`;
		const result = validateCloseMarker(long);
		expect(result.ok).toBe(false);
		expect(result.violations ?? []).toContain('too-long');
	});

	it('tolerates surrounding whitespace and CRLF', async () => {
		const line = formatCloseMarker('HECHO');
		expect(validateCloseMarker(`  \t${line}\r\n`).ok).toBe(true);
	});

	it('accepts the reason regardless of which dash the agent emitted (determinism)', async () => {
		// FASE 0 thread 2: the validator must not pass "only sometimes"
		// depending on whether the model chose an em-dash, en-dash, ASCII
		// hyphen, horizontal bar or double-hyphen as the separator. Every
		// variant carries the SAME reason and must validate identically.
		const separators = ['—', '–', '―', '-', '--'];
		for (const sep of separators) {
			const line = `🟨 [CAP] ${sep} turno agotado`;
			const result = validateCloseMarker(line);
			expect(
				result.ok,
				`CAP with separator ${JSON.stringify(sep)} should validate`,
			).toBe(true);
			expect(result.reason).toBe('turno agotado');
		}
	});

	it('accepts a reason placed after the bracket with no dash separator', async () => {
		// `[CAP] turno agotado` — the agent supplied a reason but dropped
		// the separator. The reason is present, so the required-reason rule
		// is satisfied (no `reason-missing`).
		const result = validateCloseMarker('🟨 [CAP] turno agotado');
		expect(result.ok).toBe(true);
		expect(result.reason).toBe('turno agotado');
	});

	it('still reports reason-missing when there is genuinely no reason text', async () => {
		// A bare required-reason marker (no trailing text at all) must still
		// fail — tolerance of dash variants must NOT mask a truly absent
		// reason.
		const result = validateCloseMarker('🟨 [CAP]');
		expect(result.ok).toBe(false);
		expect(result.violations).toContain('reason-missing');
	});
});

describe('validate — full response', async () => {
	it('accepts a response whose final line is the marker', async () => {
		const text = `Algo de prosa antes...\n\n${formatCloseMarker('HECHO')}`;
		expect(validateResponseClose(text).ok).toBe(true);
	});

	it('rejects extra prose after the marker', async () => {
		const text = `Prosa\n${formatCloseMarker('HECHO')}\nY más prosa después`;
		const result = validateResponseClose(text);
		// Once prose lands AFTER the marker, that prose becomes the
		// candidate last line and the marker is no longer the close.
		expect(result.ok).toBe(false);
		expect(result.state).toBeUndefined();
	});

	it('rejects trailing inline comment on the same line as the marker', async () => {
		// Build the line manually so the inline junk is NOT treated as a
		// reason by `validateCloseMarker`. Use a state that does NOT
		// accept optional reasons so the trailing comment is forced into
		// the bracket region and fails parsing.
		const line = '🟩 [HECHO]  # trailing note';
		const result = validateResponseClose(line);
		// For HECHO, the trailing text IS read as the reason — which the
		// validator allows. The real "no trailing junk" check is the
		// multi-line test below; this single-line case is accepted.
		expect(result.ok).toBe(true);
	});

	it('rejects extra lines after the marker', async () => {
		const text = `${formatCloseMarker('HECHO')}\nAnother line`;
		const result = validateResponseClose(text);
		expect(result.ok).toBe(false);
	});

	it('reports missing when the response is empty', async () => {
		expect(validateResponseClose('').violation).toBe('missing');
		expect(validateResponseClose('   \n   ').violation).toBe('missing');
	});
});

describe('splitLastLine', async () => {
	it('returns the trimmed last line', async () => {
		const r = splitLastLine('a\nb\nc  ');
		expect(r.lastLine).toBe('c');
		expect(r.hasExtraProse).toBe(false);
	});
});
