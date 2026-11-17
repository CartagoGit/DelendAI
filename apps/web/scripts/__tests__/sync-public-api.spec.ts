import { describe, expect, it } from 'vitest';
import { apiDocsProblem } from '../sync-public-api.ts';

describe('apiDocsProblem', () => {
	it('fails when the docs are missing [<20ms]', () => {
		expect(apiDocsProblem(null, 10)).toBe(
			'API docs are missing (no index.html)',
		);
	});
	it('fails when the docs are older than the code [<20ms]', () => {
		expect(apiDocsProblem(5, 10)).toBe('API docs are older than the code');
	});
	it('accepts docs at least as new as the code [<20ms]', () => {
		expect(apiDocsProblem(10, 10)).toBeNull();
	});
});
