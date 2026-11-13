import { describe, expect, it } from 'vitest';

import { checkType } from './type-matcher';

describe('checkType', () => {
	it('matches string values', () => {
		expect(checkType('ok', { type: 'string' }, '$.name')).toBeNull();
	});

	it('detects string-vs-number mismatch', () => {
		expect(checkType('42', { type: 'number' }, '$.count')?.severity).toBe(
			'high',
		);
	});

	it('matches boolean values', () => {
		expect(checkType(true, { type: 'boolean' }, '$.enabled')).toBeNull();
	});

	it('matches arrays', () => {
		expect(checkType([{ id: 1 }], { type: 'array' }, '$.items')).toBeNull();
	});

	it('matches objects', () => {
		expect(checkType({ id: 1 }, { type: 'object' }, '$.item')).toBeNull();
	});

	it('matches integers and rejects decimals', () => {
		expect(checkType(7, { type: 'integer' }, '$.count')).toBeNull();
		expect(checkType(7.5, { type: 'integer' }, '$.count')?.message).toMatch(
			/expected integer/,
		);
	});

	it('matches null only for null schema', () => {
		expect(checkType(null, { type: 'null' }, '$.gone')).toBeNull();
		expect(checkType(null, { type: 'object' }, '$.')?.severity).toBe(
			'critical',
		);
	});
});
