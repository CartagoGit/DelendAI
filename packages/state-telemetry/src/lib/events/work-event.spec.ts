import { describe, expect, it } from 'vitest';

import {
	WORK_EVENT_KIND_VALUES,
	asWorkItemId,
	isWorkEventKind,
} from './work-event';

describe('work-event contract (f00509 S1)', () => {
	it('exposes 18 closed kinds, exactly as q00020 promises', () => {
		expect(WORK_EVENT_KIND_VALUES).toHaveLength(18);
		expect(new Set(WORK_EVENT_KIND_VALUES).size).toBe(18);
	});

	it('accepts every declared kind via isWorkEventKind', () => {
		for (const kind of WORK_EVENT_KIND_VALUES) {
			expect(isWorkEventKind(kind)).toBe(true);
		}
	});

	it('rejects unknown kinds and non-strings', () => {
		expect(isWorkEventKind('not_a_kind')).toBe(false);
		expect(isWorkEventKind(undefined)).toBe(false);
		expect(isWorkEventKind(42)).toBe(false);
	});

	it('brands work item ids without altering their string value', () => {
		const branded = asWorkItemId('f00509/S1');
		expect(branded).toBe('f00509/S1');
		expect(typeof branded).toBe('string');
	});
});
