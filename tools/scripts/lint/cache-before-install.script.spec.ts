/**
 * The shape of a cache that silently does nothing.
 *
 * Both orderings are valid YAML, both run green, and both save a store
 * on every run. The only difference is whether anything can use it —
 * which is why this needs a rule rather than a review.
 */

import { describe, expect, it } from 'vitest';

import { cacheIsTooLate, stepOrder } from './cache-before-install.script';

const withOrder = (first: string, second: string): string =>
	['runs:', '    steps:', `        ${first}`, `        ${second}`].join('\n');

const CACHE = '- uses: actions/cache@v4';
const INSTALL = '- run: bun install --frozen-lockfile';

describe('cacheIsTooLate', () => {
	it('flags a cache restored after the install it should have served', () => {
		expect(cacheIsTooLate(withOrder(INSTALL, CACHE))).toBe(true);
	});

	it('accepts a cache restored before the install', () => {
		expect(cacheIsTooLate(withOrder(CACHE, INSTALL))).toBe(false);
	});

	it('says nothing about a file with no cache at all', () => {
		expect(cacheIsTooLate(withOrder(INSTALL, '- run: echo hi'))).toBe(
			false,
		);
	});

	it('says nothing about a file with no install at all', () => {
		expect(cacheIsTooLate(withOrder(CACHE, '- run: echo hi'))).toBe(false);
	});

	it('recognises the other package managers too', () => {
		expect(cacheIsTooLate(withOrder('- run: npm ci', CACHE))).toBe(true);
		expect(cacheIsTooLate(withOrder('- run: pnpm install', CACHE))).toBe(
			true,
		);
	});

	// A comment that merely mentions the command is not the command.
	it('does not mistake a comment for an install step', () => {
		expect(
			cacheIsTooLate(withOrder('# bun install happens below', CACHE)),
		).toBe(false);
	});
});

describe('stepOrder', () => {
	it('reports -1 for a step that is not there', () => {
		expect(stepOrder('runs:\n    steps:\n').cache).toBe(-1);
	});
});
