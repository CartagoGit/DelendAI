/**
 * env-schema.spec.ts — Zod schema + helpers for declaring an env schema.
 */
import { describe, expect, it } from 'vitest';

import {
	ENV_SCHEMA,
	type IEnvSchema,
	type IEnvVarSchema,
	schemaKeys,
	schemaRequired,
} from '@delendai/env/lib/validate/env-schema';

describe('schemaKeys', () => {
	it('returns the declared variable names sorted for determinism', () => {
		const schema: IEnvSchema = {
			vars: {
				FOO: { type: 'string', required: true },
				BAR: { type: 'number' },
				BAZ: { type: 'enum', enum: ['a', 'b'] } as IEnvVarSchema,
			},
		};
		expect(schemaKeys(schema)).toEqual(['BAR', 'BAZ', 'FOO']);
	});

	it('returns an empty array for an empty schema', () => {
		expect(schemaKeys({ vars: {} })).toEqual([]);
	});
});

describe('schemaRequired', () => {
	it('returns only the names marked required: true', () => {
		const schema: IEnvSchema = {
			vars: {
				FOO: { type: 'string', required: true },
				BAR: { type: 'number' },
				BAZ: {
					type: 'enum',
					enum: ['a', 'b'],
					required: true,
				} as IEnvVarSchema,
			},
		};
		expect(schemaRequired(schema)).toEqual(['BAZ', 'FOO']);
	});

	it('returns an empty array when no var is required', () => {
		const schema: IEnvSchema = {
			vars: {
				FOO: { type: 'string' },
				BAR: { type: 'number' },
			},
		};
		expect(schemaRequired(schema)).toEqual([]);
	});

	it('treats required: false as optional', () => {
		const schema: IEnvSchema = {
			vars: {
				FOO: { type: 'string', required: false },
			},
		};
		expect(schemaRequired(schema)).toEqual([]);
	});
});

describe('ENV_SCHEMA zod parser', () => {
	const validBase: IEnvVarSchema = { type: 'string' };

	it('accepts a minimal schema', () => {
		const parsed = ENV_SCHEMA.parse({ vars: { FOO: validBase } });
		expect(parsed.vars.FOO?.type).toBe('string');
	});

	it('accepts every EnvType', () => {
		const parsed = ENV_SCHEMA.parse({
			vars: {
				A: { type: 'string' },
				B: { type: 'number' },
				C: { type: 'boolean' },
				D: { type: 'enum', enum: ['x', 'y'] },
			},
		});
		expect(parsed.vars.A?.type).toBe('string');
		expect(parsed.vars.B?.type).toBe('number');
		expect(parsed.vars.C?.type).toBe('boolean');
		expect(parsed.vars.D?.type).toBe('enum');
	});

	it('accepts required: true + description', () => {
		const parsed = ENV_SCHEMA.parse({
			vars: {
				FOO: { type: 'string', required: true, description: 'the foo' },
			},
		});
		expect(parsed.vars.FOO?.required).toBe(true);
		expect(parsed.vars.FOO?.description).toBe('the foo');
	});

	it('rejects an enum without values', () => {
		expect(() =>
			ENV_SCHEMA.parse({ vars: { FOO: { type: 'enum' } } }),
		).toThrow();
	});

	it('rejects an enum with non-string values', () => {
		expect(() =>
			ENV_SCHEMA.parse({ vars: { FOO: { type: 'enum', enum: [1, 2] } } }),
		).toThrow();
	});

	it('rejects an unknown type', () => {
		expect(() =>
			ENV_SCHEMA.parse({ vars: { FOO: { type: 'object' } } }),
		).toThrow();
	});

	it('rejects a schema with no vars', () => {
		expect(() => ENV_SCHEMA.parse({})).toThrow();
	});
});
