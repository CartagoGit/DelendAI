import { describe, expect, it } from 'vitest';

import {
	detectMagicNumbers,
	MAGIC_WHITELIST,
} from '../../../../src/lib/scan/magic-numbers';

describe('scan/magic-numbers — MAGIC_WHITELIST', () => {
	it('contains 0, 1, -1, 2, 100, 1000', () => {
		expect(MAGIC_WHITELIST.has('0')).toBe(true);
		expect(MAGIC_WHITELIST.has('1')).toBe(true);
		expect(MAGIC_WHITELIST.has('-1')).toBe(true);
		expect(MAGIC_WHITELIST.has('2')).toBe(true);
		expect(MAGIC_WHITELIST.has('100')).toBe(true);
		expect(MAGIC_WHITELIST.has('1000')).toBe(true);
	});

	it('does not contain 12345', () => {
		expect(MAGIC_WHITELIST.has('12345')).toBe(false);
	});
});

describe('scan/magic-numbers — detectMagicNumbers', () => {
	it('flags a 5-digit numeric literal', () => {
		const body =
			'export const wait = (ms: number) => new Promise((r) => setTimeout(r, 12345));';
		const hits = detectMagicNumbers(body);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.value).toBe('12345');
	});

	it('does not flag a number declared as a const', () => {
		const body =
			'export const RETRY_DELAY = 12345;\nexport const wait = () => RETRY_DELAY;';
		expect(detectMagicNumbers(body)).toHaveLength(0);
	});

	it('skips `.length` and `.size` accesses', () => {
		const body = 'export const n = arr.length;\nexport const m = map.size;';
		expect(detectMagicNumbers(body)).toHaveLength(0);
	});

	it('does not flag single-digit numbers (whitelisted)', () => {
		const body =
			'export const a = 1;\nexport const b = 0;\nexport const c = 2;';
		expect(detectMagicNumbers(body)).toHaveLength(0);
	});
});
