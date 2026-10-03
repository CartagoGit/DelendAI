import { describe, expect, it } from 'vitest';

import {
	UNICODE_TOKEN_LEGEND,
	decodeUnicodeFromAgent,
	inspectUnicodeForAgent,
	rewriteUnicodeForAgent,
} from '@delendai/core/public';

const WHALE = String.fromCodePoint(0x1f433);
const FAMILY = [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467]
	.map((cp) => String.fromCodePoint(cp))
	.join('');
const UNKNOWN_ASTRAL = String.fromCodePoint(0x1fabc);
const UNPAIRED = '\uD83D'; // high surrogate, no low pair

describe('rewriteUnicodeForAgent', () => {
	it('is a pure no-op for BMP letters, digits, punctuation, accents and CJK', () => {
		const input = 'café 漢字 — hello 123.';
		expect(rewriteUnicodeForAgent(input)).toBe(input);
		expect(inspectUnicodeForAgent(input).changed).toBe(false);
	});

	it('keeps tab, LF and CR', () => {
		const input = 'a\tb\nc\rd';
		expect(rewriteUnicodeForAgent(input)).toBe(input);
	});

	it('rewrites U+1F433 as a named whale token, never hex-only', () => {
		const out = rewriteUnicodeForAgent(
			`use the whale ${WHALE} in the README`,
		);
		expect(out.startsWith(`${UNICODE_TOKEN_LEGEND}\n`)).toBe(true);
		expect(out).toContain('[emoji:whale U+1F433]');
		expect(out).not.toContain('\\u{1F433}');
		expect(out).not.toContain(WHALE);
		expect([...out].every((ch) => ch.charCodeAt(0) <= 0x7f)).toBe(true);
		expect(out).toContain(
			'use the whale [emoji:whale U+1F433] in the README',
		);
	});

	it('JSON.stringifies a whale prompt without unpaired surrogates', () => {
		const out = rewriteUnicodeForAgent(WHALE);
		const encoded = JSON.stringify(out);
		expect(encoded).toContain('[emoji:whale U+1F433]');
		expect(encoded).not.toMatch(/\\uD[89A-Fa-f][0-9A-Fa-f]{2}/);
	});

	it('rewrites unknown astral code points as [unicode:U+XXXXX]', () => {
		const out = rewriteUnicodeForAgent(UNKNOWN_ASTRAL);
		expect(out).toContain('[unicode:U+1FABC]');
		expect(out).not.toContain(UNKNOWN_ASTRAL);
		expect(out.startsWith(UNICODE_TOKEN_LEGEND)).toBe(true);
	});

	it('rewrites unpaired surrogates as [unicode:replacement U+FFFD]', () => {
		const out = rewriteUnicodeForAgent(`x${UNPAIRED}y`);
		expect(out).toContain('[unicode:replacement U+FFFD]');
		expect(out).toContain('x');
		expect(out).toContain('y');
	});

	it('escapes C0/C1 controls except tab/LF/CR', () => {
		const out = rewriteUnicodeForAgent(`a\u0001b\u0080c`);
		expect(out).toContain('[unicode:U+0001]');
		expect(out).toContain('[unicode:U+0080]');
		expect(out).toContain('a');
		expect(out).toContain('b');
		expect(out).toContain('c');
	});

	it('keeps a ZWJ family sequence as one named token listing every code point', () => {
		const out = rewriteUnicodeForAgent(FAMILY);
		expect(out).toContain(
			'[emoji:family-man-woman-girl U+1F468 U+200D U+1F469 U+200D U+1F467]',
		);
		expect(out).not.toContain(String.fromCodePoint(0x1f468));
	});

	it('does not prepend a second legend on an already-rewritten string', () => {
		const once = rewriteUnicodeForAgent(WHALE);
		const twice = rewriteUnicodeForAgent(once);
		expect(twice).toBe(once);
		expect(twice.split(UNICODE_TOKEN_LEGEND).length - 1).toBe(1);
	});
});

describe('decodeUnicodeFromAgent', () => {
	it('round-trips a named whale token back to U+1F433', () => {
		const original = `use the whale ${WHALE} in the README`;
		expect(decodeUnicodeFromAgent(rewriteUnicodeForAgent(original))).toBe(
			original,
		);
	});

	it('round-trips a ZWJ family sequence', () => {
		expect(decodeUnicodeFromAgent(rewriteUnicodeForAgent(FAMILY))).toBe(
			FAMILY,
		);
	});

	it('round-trips C0 controls', () => {
		const original = `a\u0001b`;
		expect(decodeUnicodeFromAgent(rewriteUnicodeForAgent(original))).toBe(
			original,
		);
	});

	it('decodes unpaired-surrogate tokens to U+FFFD', () => {
		const out = decodeUnicodeFromAgent(rewriteUnicodeForAgent(UNPAIRED));
		expect(out).toBe('\uFFFD');
	});

	it('leaves plain BMP text unchanged', () => {
		expect(decodeUnicodeFromAgent('hello café')).toBe('hello café');
	});
});
