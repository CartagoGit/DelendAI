import { describe, expect, it } from 'vitest';

import type { IOpenApiOperation } from '../spec/openapi';

import { validateResponse } from './response-validator';

const OPERATION: IOpenApiOperation = {
	operationId: 'getUser',
	method: 'GET',
	path: '/users/{id}',
	parameters: [],
	tags: ['users'],
	responses: [
		{
			status: '200',
			description: 'OK',
			contentType: 'application/json',
			schema: {
				type: 'object',
				required: ['id', 'profile', 'links'],
				properties: {
					id: { type: 'string' },
					nickname: {
						type: 'string',
						nullable: true,
					} as never,
					role: {
						type: 'string',
						enum: ['admin', 'editor', 'viewer'],
					},
					profile: {
						type: 'object',
						required: ['email', 'website'],
						additionalProperties: false,
						properties: {
							email: { type: 'string', format: 'email' },
							website: { type: 'string', format: 'uri' },
						},
					} as never,
					links: {
						type: 'array',
						items: {
							type: 'object',
							required: ['href'],
							properties: {
								href: { type: 'string', format: 'uri' },
							},
						},
					},
				},
			} as never,
		},
	],
};

describe('validateResponse (f00130 S2)', () => {
	it('returns an empty findings array for a valid nested response', () => {
		expect(
			validateResponse(OPERATION, {
				id: 'u_1',
				role: 'admin',
				nickname: null,
				profile: {
					email: 'ada@example.com',
					website: 'https://example.com/users/ada',
				},
				links: [{ href: 'https://example.com/docs' }],
			}),
		).toEqual([]);
	});

	it('flags a type mismatch', () => {
		const findings = validateResponse(OPERATION, {
			id: 42,
			role: 'admin',
			profile: {
				email: 'ada@example.com',
				website: 'https://example.com',
			},
			links: [{ href: 'https://example.com/docs' }],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('type-mismatch');
		expect(findings[0]?.message).toContain('$.id');
	});

	it('flags a missing required field', () => {
		const findings = validateResponse(OPERATION, {
			id: 'u_1',
			role: 'admin',
			profile: {
				email: 'ada@example.com',
				website: 'https://example.com',
			},
		});
		expect(
			findings.some(
				(finding) => finding.ruleId === 'missing-required-field',
			),
		).toBe(true);
		expect(
			findings.some((finding) => finding.message.includes('$.links')),
		).toBe(true);
	});

	it('flags an extra property when additionalProperties is false', () => {
		const findings = validateResponse(OPERATION, {
			id: 'u_1',
			role: 'admin',
			profile: {
				email: 'ada@example.com',
				website: 'https://example.com',
				extra: true,
			},
			links: [{ href: 'https://example.com/docs' }],
		});
		expect(
			findings.some((finding) => finding.ruleId === 'extra-property'),
		).toBe(true);
		expect(
			findings.some((finding) =>
				finding.message.includes('$.profile.extra'),
			),
		).toBe(true);
	});

	it('flags enum values outside the allowed range', () => {
		const findings = validateResponse(OPERATION, {
			id: 'u_1',
			role: 'owner',
			profile: {
				email: 'ada@example.com',
				website: 'https://example.com',
			},
			links: [{ href: 'https://example.com/docs' }],
		});
		expect(
			findings.some((finding) => finding.ruleId === 'enum-out-of-range'),
		).toBe(true);
	});

	it('accepts nullable fields when null or omitted', () => {
		expect(
			validateResponse(OPERATION, {
				id: 'u_1',
				role: 'admin',
				profile: {
					email: 'ada@example.com',
					website: 'https://example.com',
				},
				links: [{ href: 'https://example.com/docs' }],
			}).find((finding) => finding.message.includes('nickname')),
		).toBeUndefined();
		expect(
			validateResponse(OPERATION, {
				id: 'u_1',
				role: 'admin',
				nickname: null,
				profile: {
					email: 'ada@example.com',
					website: 'https://example.com',
				},
				links: [{ href: 'https://example.com/docs' }],
			}).find((finding) => finding.message.includes('nickname')),
		).toBeUndefined();
	});

	it('flags invalid email and uri formats', () => {
		const findings = validateResponse(OPERATION, {
			id: 'u_1',
			role: 'admin',
			profile: {
				email: 'not-an-email',
				website: 'not-a-uri',
			},
			links: [{ href: 'also-not-a-uri' }],
		});
		expect(
			findings.filter((finding) => finding.ruleId === 'format-mismatch'),
		).toHaveLength(3);
	});

	it('keeps the email boundary the regular expression used to draw', () => {
		// The predicate stopped being a regular expression (it backtracked
		// polynomially on an attacker-supplied response); what it accepts
		// must not have moved with it. One `@`, a non-empty local part, and
		// a domain whose dot is interior.
		const emailFindings = (email: string) =>
			validateResponse(OPERATION, {
				id: 'u_1',
				role: 'admin',
				profile: { email, website: 'https://example.com' },
				links: [{ href: 'https://example.com/docs' }],
			}).filter((finding) => finding.ruleId === 'format-mismatch');

		for (const accepted of [
			'ada@example.com',
			'ada@sub.example.co.uk',
			'ada+tag@example.com',
		]) {
			expect(emailFindings(accepted)).toEqual([]);
		}
		for (const rejected of [
			'ada@.com',
			'ada@example.',
			'ada@example',
			'@example.com',
			'ada@@example.com',
			'ada example@example.com',
		]) {
			expect(emailFindings(rejected)).toHaveLength(1);
		}
	});

	it('keeps the exact email format finding payload for a representative invalid response', () => {
		expect(
			validateResponse(OPERATION, {
				id: 'u_1',
				role: 'admin',
				profile: {
					email: 'not-an-email',
					website: 'https://example.com',
				},
				links: [{ href: 'https://example.com/docs' }],
			}),
		).toEqual([
			{
				ruleId: 'format-mismatch',
				severity: 'medium',
				message:
					'$.profile.email: expected format email but received "not-an-email".',
				fix: 'Provide a value that matches the email format.',
			},
		]);
	});

	it('rejects a long malformed email candidate quickly', () => {
		const startedAt = performance.now();
		const findings = validateResponse(OPERATION, {
			id: 'u_1',
			role: 'admin',
			profile: {
				email: `${'localpart'.repeat(4_000)} @example.com`,
				website: 'https://example.com',
			},
			links: [{ href: 'https://example.com/docs' }],
		});
		expect(findings).toEqual([
			{
				ruleId: 'format-mismatch',
				severity: 'medium',
				message: `$.profile.email: expected format email but received ${JSON.stringify(`${'localpart'.repeat(4_000)} @example.com`)}.`,
				fix: 'Provide a value that matches the email format.',
			},
		]);
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});

	it('flags an empty body when the response schema expects an object', () => {
		const findings = validateResponse(OPERATION, undefined);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('type-mismatch');
		expect(findings[0]?.severity).toBe('critical');
	});
});

describe('schemas the walker has to reason about rather than read', () => {
	// These paths existed untested: a response body is somebody else's
	// output, and the shapes below are the ones a real OpenAPI document
	// produces — a schema with no `type`, a nullable field, an array of
	// items, a number that is not an integer, and the two composition
	// keywords this validator deliberately refuses.
	const validate = (schema: unknown, body: unknown) =>
		validateResponse(
			{
				operationId: 'x',
				method: 'GET',
				path: '/x',
				parameters: [],
				tags: [],
				responses: [],
			},
			body,
			{ schema: schema as never },
		);

	it('infers object from properties when no type is written', () => {
		expect(
			validate({ properties: { a: { type: 'string' } } }, { a: 'ok' }),
		).toEqual([]);
		expect(
			validate(
				{ properties: { a: { type: 'string' } } },
				'not an object',
			),
		).toHaveLength(1);
	});

	it('infers array from items when no type is written', () => {
		expect(validate({ items: { type: 'string' } }, ['a', 'b'])).toEqual([]);
		const findings = validate({ items: { type: 'string' } }, ['a', 2]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('$[1]');
	});

	it('accepts null only where the schema says nullable', () => {
		expect(validate({ type: 'string', nullable: true }, null)).toEqual([]);
		expect(validate({ type: 'string' }, null)).toHaveLength(1);
	});

	it('separates integer from number', () => {
		expect(validate({ type: 'integer' }, 3)).toEqual([]);
		expect(validate({ type: 'integer' }, 3.5)).toHaveLength(1);
		expect(validate({ type: 'number' }, 3.5)).toEqual([]);
		// Infinity is a number in JavaScript and not one in JSON.
		expect(
			validate({ type: 'number' }, Number.POSITIVE_INFINITY),
		).toHaveLength(1);
	});

	it('checks the remaining primitive types', () => {
		expect(validate({ type: 'boolean' }, true)).toEqual([]);
		expect(validate({ type: 'boolean' }, 'true')).toHaveLength(1);
		expect(validate({ type: 'null' }, null)).toEqual([]);
		expect(validate({ type: 'array' }, [])).toEqual([]);
		expect(validate({ type: 'array' }, {})).toHaveLength(1);
	});

	it('validates the uri format through a real parse', () => {
		expect(
			validate({ type: 'string', format: 'uri' }, 'https://example.com'),
		).toEqual([]);
		expect(
			validate({ type: 'string', format: 'uri' }, 'not a uri'),
		).toHaveLength(1);
		// An unknown format is not an error: the validator has no opinion
		// about formats it does not implement, and inventing one would
		// flag every valid response that uses `format: uuid`.
		expect(
			validate({ type: 'string', format: 'uuid' }, 'anything'),
		).toEqual([]);
	});

	it('refuses oneOf and anyOf loudly instead of guessing', () => {
		// Silently accepting a composition keyword would report "valid"
		// for a body nobody checked.
		expect(() =>
			validate({ oneOf: [{ type: 'string' }, { type: 'number' }] }, 1),
		).toThrow(/unsupported-schema-feature: oneOf/);
		expect(() => validate({ anyOf: [{ type: 'string' }] }, 1)).toThrow(
			/unsupported-schema-feature: anyOf/,
		);
	});

	it('walks into an object whose additionalProperties carry a schema', () => {
		expect(
			validate(
				{
					type: 'object',
					properties: {},
					additionalProperties: { type: 'string' },
				},
				{ extra: 'ok', another: 2 },
			),
		).toHaveLength(1);
	});

	it('returns nothing when the operation declares no schema at all', () => {
		expect(
			validateResponse(
				{
					operationId: 'x',
					method: 'GET',
					path: '/x',
					parameters: [],
					tags: [],
					responses: [],
				},
				{ anything: true },
			),
		).toEqual([]);
	});
});
