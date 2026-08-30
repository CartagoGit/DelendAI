#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	DETAIL_LEVELS,
	projectDetail,
	UnknownDetailLevelError,
	withDetail,
	type Detail,
	type DetailProjections,
	type WithDetail,
} from '../../../../src/lib/contracts/detail.contract';

describe('detail.contract (f00187)', () => {
	it('exports three detail levels in a stable order', () => {
		expect([...DETAIL_LEVELS]).toEqual(['compact', 'normal', 'full']);
	});

	it('projectDetail defaults to normal when requested is undefined', () => {
		const full = { id: 'q00006', inner: { a: 1, b: 2 } };
		const levels: DetailProjections<typeof full> = {
			compact: (f) => ({ id: f.id }),
			normal: (f) => ({ id: f.id, inner: f.inner.a }),
			full: (f) => f,
		};
		const out = projectDetail(full, levels);
		expect(out).toEqual({ id: 'q00006', inner: 1 });
	});

	it('projectDetail honors compact and full explicitly', () => {
		const full = { id: 'q00006', body: 'x'.repeat(100) };
		const levels: DetailProjections<typeof full> = {
			compact: (f) => ({ id: f.id }),
			normal: (f) => ({ id: f.id, body: f.body.slice(0, 10) }),
			full: (f) => f,
		};
		expect(projectDetail(full, levels, 'compact')).toEqual({
			id: 'q00006',
		});
		expect(projectDetail(full, levels, 'normal')).toEqual({
			id: 'q00006',
			body: 'xxxxxxxxxx',
		});
		expect(projectDetail(full, levels, 'full')).toEqual(full);
	});

	it('projectDetail throws UnknownDetailLevelError on a missing level', () => {
		const levels = {
			compact: (f: { id: string }) => f,
			normal: (f: { id: string }) => f,
			full: (f: { id: string }) => f,
		} as Partial<DetailProjections<{ id: string }>>;
		expect(() =>
			projectDetail(
				{ id: 'q' },
				levels as DetailProjections<{ id: string }>,
				'compact',
			),
		).not.toThrow();
		// Force a missing level by removing it at runtime.
		const partial = {
			normal: levels.normal!,
		} as unknown as DetailProjections<{
			id: string;
		}>;
		expect(() =>
			projectDetail({ id: 'q' }, partial, 'compact' satisfies Detail),
		).toThrow(UnknownDetailLevelError);
	});

	it('withDetail keeps the base shape and narrows to WithDetail', () => {
		const base = { foo: 1 };
		const result = withDetail(base);
		expect(result).toBe(base);
		const _typed: WithDetail = result;
		expect(_typed).toBeDefined();
	});

	it('withDetail preserves an existing detail field unchanged', () => {
		const base = { foo: 1, detail: 'compact' as const };
		const result = withDetail(base);
		expect(result.detail).toBe('compact');
	});
});
