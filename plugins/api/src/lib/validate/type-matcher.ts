import type { IJsonSchema, IJsonSchemaPrimitive } from '../spec/openapi';

import type { ITypedMismatch } from './interfaces';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const inferSchemaType = (
	schema: IJsonSchema,
): IJsonSchemaPrimitive | undefined => {
	if (schema.type !== undefined) return schema.type;
	if (
		schema.properties !== undefined ||
		schema.required !== undefined ||
		schema.description !== undefined
	) {
		return 'object';
	}
	if (schema.items !== undefined) return 'array';
	return undefined;
};

export const detectValueType = (
	value: unknown,
): IJsonSchemaPrimitive | 'unknown' => {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	if (isPlainObject(value)) return 'object';
	if (typeof value === 'string') return 'string';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Number.isInteger(value) ? 'integer' : 'number';
	}
	return 'unknown';
};

const matchesType = (
	value: unknown,
	expected: IJsonSchemaPrimitive,
): boolean => {
	switch (expected) {
		case 'string':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'integer':
			return typeof value === 'number' && Number.isInteger(value);
		case 'boolean':
			return typeof value === 'boolean';
		case 'array':
			return Array.isArray(value);
		case 'object':
			return isPlainObject(value);
		case 'null':
			return value === null;
	}
};

export const checkType = (
	value: unknown,
	schema: IJsonSchema,
	path: string,
): ITypedMismatch | null => {
	const expected = inferSchemaType(schema);
	if (expected === undefined) return null;
	if (matchesType(value, expected)) return null;
	const actual = detectValueType(value);
	return {
		path,
		expected,
		actual,
		severity: path === '$.' && expected === 'object' ? 'critical' : 'high',
		message: `${path} expected ${expected} but received ${actual}.`,
		schema,
	};
};

export const _internal = { detectValueType, inferSchemaType, matchesType };
