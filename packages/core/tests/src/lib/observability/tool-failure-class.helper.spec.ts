import { describe, expect, it } from 'vitest';

import {
	deriveToolFailure,
	failureField,
} from '../../../../src/lib/observability/tool-failure-class.helper';
import { toolError } from '../../../../src/lib/shared/tool-response';

describe('deriveToolFailure', () => {
	it('[<100ms] classes a schema validation error as input-invalid', () => {
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

	it('[<100ms] classes an isError result as refused and prefers the structured code', () => {
		const coded = deriveToolFailure({
			result: toolError('nope', undefined, 'one-per-create'),
		});
		expect(coded).toEqual({ class: 'refused', code: 'one-per-create' });
	});

	it('[<100ms] classes an exception as threw', () => {
		const failure = deriveToolFailure({ error: new Error('boom') });
		expect(failure).toEqual({ class: 'threw', code: 'boom' });
	});

	it('[<100ms] classes an aborted call as cancelled', () => {
		const failure = deriveToolFailure({
			result: toolError('aborted'),
			cancelled: true,
		});
		expect(failure.class).toBe('cancelled');
	});

	it('[<100ms] gives two refusals differing only in an id the same code', () => {
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

	it('[<100ms] never keeps a secret-shaped value in the code', () => {
		const secret = `ghp_${'a1B2'.repeat(9)}`;
		const failure = deriveToolFailure({
			error: new Error(`token=${secret} rejected`),
		});
		expect(failure.code).not.toContain(secret);
	});

	it('[<100ms] cuts the code to 120 characters', () => {
		const failure = deriveToolFailure({
			error: new Error('word '.repeat(100)),
		});
		expect(failure.code.length).toBeLessThanOrEqual(120);
	});

	it('[<100ms] reads the reason from the envelope message or the first text part', () => {
		expect(
			deriveToolFailure({
				result: {
					structuredContent: { error: { message: 'Bad thing' } },
				},
			}).code,
		).toBe('Bad thing');
		expect(
			deriveToolFailure({
				result: {
					content: [{ type: 'image' }, { text: 'Plain text' }],
				},
			}).code,
		).toBe('Plain text');
	});

	it('[<100ms] replaces paths, quoted values, hashes and numbers', () => {
		const failure = deriveToolFailure({
			result: toolError(
				"Cannot read /a/b.md at 'x y' commit abcdef1234 after 42 tries. More.",
			),
		});
		expect(failure.code).toBe(
			'Cannot read <path> at <value> commit <hash> after <n> tries.',
		);
	});

	it('[<100ms] falls back to unknown and handles a thrown non-Error', () => {
		expect(deriveToolFailure({ result: {} }).code).toBe('unknown');
		expect(deriveToolFailure({ error: 'plain' })).toEqual({
			class: 'threw',
			code: 'plain',
		});
		expect(
			deriveToolFailure({ error: new Error('Invalid params: x') }).class,
		).toBe('input-invalid');
	});

	it('[<100ms] adds the failure field on failed calls only', () => {
		expect(failureField(false, undefined, undefined, false)).toEqual({});
		expect(
			failureField(true, undefined, new Error('x'), false).failure?.class,
		).toBe('threw');
	});
});
