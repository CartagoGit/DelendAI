import { describe, expect, it } from 'vitest';

import { walkSchema } from './schema-walker';

describe('walkSchema', () => {
	it('flags nested missing, extra and type mismatches', () => {
		const findings = walkSchema(
			{
				user: {
					name: 'Alice',
					tags: [{ id: 'oops' }],
					extra: true,
				},
			},
			{
				type: 'object',
				required: ['user'],
				properties: {
					user: {
						type: 'object',
						required: ['name', 'email', 'tags'],
						properties: {
							name: { type: 'string' },
							email: { type: 'string' },
							tags: {
								type: 'array',
								items: {
									type: 'object',
									required: ['id'],
									properties: { id: { type: 'integer' } },
								},
							},
						},
					},
				},
			},
		);
		expect(findings.map((finding) => finding.ruleId).sort()).toEqual([
			'extra-field',
			'missing-required-field',
			'type-mismatch',
		]);
		expect(findings.map((finding) => finding.path).sort()).toEqual([
			'$.user.email',
			'$.user.extra',
			'$.user.tags[0].id',
		]);
	});

	it('flags missing fields inside array items', () => {
		const findings = walkSchema(
			[{ name: 'Alice' }],
			{
				type: 'array',
				items: {
					type: 'object',
					required: ['id', 'name'],
					properties: {
						id: { type: 'integer' },
						name: { type: 'string' },
					},
				},
			},
			'$.items',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toBe('$.items[0].id');
		expect(findings[0]?.severity).toBe('critical');
	});

	it('treats empty properties maps as extra-field only', () => {
		const findings = walkSchema(
			{ id: 1, name: 'Alice' },
			{ type: 'object', properties: {} },
		);
		expect(findings.map((finding) => finding.ruleId)).toEqual([
			'extra-field',
			'extra-field',
		]);
	});
});
