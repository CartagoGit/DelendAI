import { describe, expect, it } from 'vitest';

import { jsonSchemaToTs } from '../../scripts/types/emit-tool-types.script';

describe('jsonSchemaToTs — nullable scalars', () => {
	it('keeps null in a type array', () => {
		expect(jsonSchemaToTs({ type: ['number', 'null'] })).toBe(
			'number | null',
		);
	});

	it('keeps null on an object property', () => {
		const ts = jsonSchemaToTs({
			type: 'object',
			properties: { average: { type: ['number', 'null'] } },
			required: ['average'],
		});
		expect(ts).toContain('average: number | null');
	});

	it('still emits a single type unchanged', () => {
		expect(jsonSchemaToTs({ type: 'string' })).toBe('string');
	});
});
