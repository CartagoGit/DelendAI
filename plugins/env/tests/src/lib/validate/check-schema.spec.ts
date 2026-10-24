/**
 * check-schema.spec.ts — diff a parsed .env against a declared schema.
 */
import { describe, expect, it } from 'vitest';

import { parseEnv } from '@delendai/env/lib/env/check-env';
import type { IEnvSchema } from '@delendai/env/lib/validate/env-schema';
import {
	checkSchema,
	validateEntry,
	validateValue,
} from '@delendai/env/lib/validate/check-schema';

const SCHEMA: IEnvSchema = {
	vars: {
		API_KEY: { type: 'string', required: true },
		API_URL: { type: 'string', required: true },
		NUMERIC: { type: 'number', required: true },
		FEATURE_X: { type: 'boolean' },
		ENVIRONMENT: { type: 'enum', enum: ['dev', 'staging', 'prod'] },
		OPTIONAL: { type: 'string' },
	},
};

const SAMPLE = `API_KEY=abc123
API_URL=https://example.com
NUMERIC=42
FEATURE_X=true
ENVIRONMENT=dev
OPTIONAL=present
`;

const REQUIRED_ONLY: IEnvSchema = {
	vars: {
		API_KEY: { type: 'string', required: true },
		API_URL: { type: 'string', required: true },
	},
};

const TYPED_ONLY: IEnvSchema = {
	vars: {
		API_KEY: { type: 'string', required: true },
		API_URL: { type: 'string', required: true },
		NUMERIC: { type: 'number', required: true },
		FEATURE_X: { type: 'boolean' },
	},
};

const findEntry = (content: string, key: string) => {
	const parsed = parseEnv(content);
	const entry = parsed.entries.find((e) => e.key === key);
	if (entry === undefined) {
		throw new Error(`expected parsed entry for ${key}`);
	}
	return entry;
};

describe('validateValue', () => {
	it('returns undefined for a valid string', () => {
		expect(validateValue('hello', { type: 'string' })).toBeUndefined();
	});

	it('returns undefined for a valid number', () => {
		expect(validateValue('42', { type: 'number' })).toBeUndefined();
		expect(validateValue('-3.14', { type: 'number' })).toBeUndefined();
	});

	it('returns undefined for a valid boolean', () => {
		expect(validateValue('true', { type: 'boolean' })).toBeUndefined();
		expect(validateValue('false', { type: 'boolean' })).toBeUndefined();
	});

	it('returns undefined for a valid enum member', () => {
		expect(
			validateValue('dev', { type: 'enum', enum: ['dev', 'prod'] }),
		).toBeUndefined();
	});

	it('returns a finding for a non-numeric number', () => {
		const f = validateValue('forty-two', { type: 'number' });
		expect(f?.ruleId).toBe('env/mistyped-value');
		expect(f?.severity).toBe('medium');
	});

	it('returns a finding for a non-boolean boolean', () => {
		const f = validateValue('not-a-bool', { type: 'boolean' });
		expect(f?.ruleId).toBe('env/mistyped-value');
	});

	it('returns a finding for an enum value not in the allowed list', () => {
		const f = validateValue('staging', {
			type: 'enum',
			enum: ['dev', 'prod'],
		});
		expect(f?.ruleId).toBe('env/mistyped-value');
		expect(f?.message).toContain('staging');
	});
});

describe('validateEntry', () => {
	it('returns undefined when value matches the declared type', () => {
		const entry = findEntry(SAMPLE, 'NUMERIC');
		expect(validateEntry(entry, { type: 'number' })).toBeUndefined();
	});

	it('returns a mistyped finding when value does not match', () => {
		const entry = findEntry('NUMERIC=not-a-number\n', 'NUMERIC');
		const f = validateEntry(entry, { type: 'number' });
		expect(f?.ruleId).toBe('env/mistyped-value');
	});
});

describe('checkSchema', () => {
	it('returns no findings for a fully conformant env', () => {
		const parsed = parseEnv(SAMPLE);
		const findings = checkSchema(parsed, SCHEMA);
		expect(findings).toEqual([]);
	});

	it('emits missing-required for every required var that is absent', () => {
		const parsed = parseEnv('API_KEY=abc\n');
		const findings = checkSchema(parsed, REQUIRED_ONLY);
		const missing = findings.filter(
			(f) => f.ruleId === 'env/missing-required',
		);
		const msg = missing.map((f) => f.message).join('\n');
		expect(missing).toHaveLength(1);
		expect(msg).toContain('API_URL');
		expect(missing[0]?.severity).toBe('high');
	});

	it('emits missing-typed for a typed var that is absent', () => {
		const parsed = parseEnv(
			'API_KEY=abc\nAPI_URL=https://x.com\nNUMERIC=42\n',
		);
		const findings = checkSchema(parsed, TYPED_ONLY);
		const missing = findings.filter(
			(f) => f.ruleId === 'env/missing-typed',
		);
		expect(missing).toHaveLength(1);
		expect(missing[0]?.message).toContain('FEATURE_X');
		expect(missing[0]?.severity).toBe('medium');
	});

	it('emits extra-undeclared for keys not in the schema', () => {
		const parsed = parseEnv('API_KEY=abc\nROGUE_VAR=hello\n');
		const findings = checkSchema(parsed, REQUIRED_ONLY);
		const extra = findings.filter(
			(f) => f.ruleId === 'env/extra-undeclared',
		);
		expect(extra).toHaveLength(1);
		expect(extra[0]?.message).toContain('ROGUE_VAR');
		expect(extra[0]?.severity).toBe('low');
	});

	it('emits mistyped-value when a value cannot be parsed as the declared type', () => {
		const parsed = parseEnv(
			'API_KEY=abc\nAPI_URL=https://x.com\nNUMERIC=NaN\n',
		);
		const findings = checkSchema(parsed, {
			vars: {
				API_KEY: { type: 'string', required: true },
				API_URL: { type: 'string', required: true },
				NUMERIC: { type: 'number', required: true },
			},
		});
		const mistyped = findings.filter(
			(f) => f.ruleId === 'env/mistyped-value',
		);
		expect(mistyped).toHaveLength(1);
		expect(mistyped[0]?.message).toContain('NUMERIC');
	});

	it('emits multiple findings across categories when several rules are violated', () => {
		const parsed = parseEnv('NUMERIC=NaN\nGHOST=1\n');
		const findings = checkSchema(parsed, {
			vars: {
				API_KEY: { type: 'string', required: true },
				NUMERIC: { type: 'number', required: true },
			},
		});
		expect(findings.some((f) => f.ruleId === 'env/missing-required')).toBe(
			true,
		);
		expect(findings.some((f) => f.ruleId === 'env/mistyped-value')).toBe(
			true,
		);
		expect(findings.some((f) => f.ruleId === 'env/extra-undeclared')).toBe(
			true,
		);
	});

	it('returns extra-undeclared for keys not in an empty schema', () => {
		const findings = checkSchema(parseEnv('ANY=thing'), { vars: {} });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('env/extra-undeclared');
	});

	it('returns an empty array for an empty env and empty schema', () => {
		const findings = checkSchema(parseEnv(''), { vars: {} });
		expect(findings).toEqual([]);
	});
});
