import { describe, expect, it } from 'vitest';

import { deriveToolFailure } from '../../../../src/lib/observability/tool-failure-class.helper';
import { toolError } from '../../../../src/lib/shared/tool-response';

describe('deriveToolFailure', () => {
	it('classes a schema validation error as input-invalid', () => {
		const result = {
			isError: true,
			content: [
				{
					type: 'text',
					text: 'Input validation error: Invalid arguments for tool x',
				},
			],
		};
		expect(deriveToolFailure({ result }).class).toBe('input-invalid');
	});

	it('classes an isError result as refused and prefers the structured code', () => {
		const coded = deriveToolFailure({
			result: toolError('nope', undefined, 'one-per-create'),
		});
		expect(coded).toEqual({ class: 'refused', code: 'one-per-create' });
	});

	it('classes an exception as threw', () => {
		const failure = deriveToolFailure({ error: new Error('boom') });
		expect(failure).toEqual({ class: 'threw', code: 'boom' });
	});

	it('classes an aborted call as cancelled', () => {
		const failure = deriveToolFailure({
			result: toolError('aborted'),
			cancelled: true,
		});
		expect(failure.class).toBe('cancelled');
	});

	it('gives two refusals differing only in an id the same code', () => {
		const a = deriveToolFailure({
			result: toolError(
				'Proposal f00820 is not open at "S1" in /a/b.md.',
			),
		});
		const b = deriveToolFailure({
			result: toolError(
				'Proposal x01085 is not open at "S2" in /c/d.md.',
			),
		});
		expect(a.code).toBe(b.code);
		expect(a.code).not.toContain('f00820');
	});

	it('never keeps a secret-shaped value in the code', () => {
		const secret = `ghp_${'a1B2'.repeat(9)}`;
		const failure = deriveToolFailure({
			error: new Error(`token=${secret} rejected`),
		});
		expect(failure.code).not.toContain(secret);
	});

	it('cuts the code to 120 characters', () => {
		const failure = deriveToolFailure({
			error: new Error('word '.repeat(100)),
		});
		expect(failure.code.length).toBeLessThanOrEqual(120);
	});
});
