import { describe, expect, it } from 'vitest';

import {
	paginateFileExcerpt,
	paginateItems,
	truncateIfTooLarge,
} from '@delendai/core/public';

describe('truncateIfTooLarge honest contract', () => {
	it('returns an explicit clamp when maxBytes is below the minimum honest envelope', () => {
		const result = truncateIfTooLarge({ rows: 'x'.repeat(256) }, 16);
		expect(result.truncated).toBe(true);
		expect(result.clamped).toBe(true);
		expect(result.finalBytes).toBeGreaterThan(16);
		expect(result.value).toMatchObject({
			__truncated: true,
			clamped: true,
			finalBytes: result.finalBytes,
			maxBytes: 16,
			head: { kind: 'object' },
		});
	});

	it('keeps multibyte previews valid and avoids partial JSON in head', () => {
		const value = 'áéíóú🙂🙂🙂fin'.repeat(64);
		const result = truncateIfTooLarge(value, 220);
		expect(result.truncated).toBe(true);
		expect(result.clamped).toBeUndefined();
		expect(result.finalBytes).toBeLessThanOrEqual(220);
		const payload = result.value as {
			__truncated: true;
			head: { kind: 'string'; preview: string; truncated: true };
		};
		expect(payload.__truncated).toBe(true);
		expect(payload.head.kind).toBe('string');
		expect(payload.head.truncated).toBe(true);
		expect(payload.head.preview.length).toBeGreaterThan(0);
		expect(payload.head.preview.endsWith('�')).toBe(false);
		expect(JSON.stringify(payload)).not.toContain('\\"áéí');
		expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
	});
});

describe('universal pagination helper', () => {
	it('paginates arrays with cursor, nextCursor and hasMore', () => {
		const first = paginateItems(['a', 'b', 'c', 'd'], { limit: 2 });
		expect(first).toEqual({
			items: ['a', 'b'],
			page: { cursor: 0, nextCursor: 2, hasMore: true },
		});

		const second = paginateItems(['a', 'b', 'c', 'd'], {
			cursor: first.page.nextCursor ?? 0,
			limit: 2,
		});
		expect(second).toEqual({
			items: ['c', 'd'],
			page: { cursor: 2, nextCursor: null, hasMore: false },
		});
	});

	it('builds file excerpts with inclusive line ranges', () => {
		const page = paginateFileExcerpt('one\ntwo\nthree\nfour', {
			cursor: 1,
			limit: 2,
		});
		expect(page).toEqual({
			items: [{ startLine: 2, endLine: 3, excerpt: 'two\nthree' }],
			page: { cursor: 1, nextCursor: 3, hasMore: true },
		});
	});
});
