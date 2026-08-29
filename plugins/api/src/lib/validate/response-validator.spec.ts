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
