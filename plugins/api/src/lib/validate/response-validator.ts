/**
 * f00130 S2 — Pure response validator for OpenAPI response schemas.
 *
 * Walks the parsed response value against the selected success schema and
 * returns normalized findings (r00012) for contract mismatches. Unsupported
 * schema features (`oneOf` / `anyOf`) fail fast with an explicit error so the
 * host can surface a structured hint instead of a crash.
 */
import type { IFinding } from '@mcp-vertex/core/public';

import { detectValueType } from './type-matcher';
import type { IJsonSchema, IOpenApiOperation } from '../spec/openapi';

type IJsonSchemaLike = IJsonSchema & {
	readonly nullable?: boolean;
	readonly additionalProperties?: boolean | IJsonSchema;
	readonly oneOf?: readonly IJsonSchema[];
	readonly anyOf?: readonly IJsonSchema[];
};

export interface IValidateResponseOptions {
	readonly schema?: IJsonSchema;
}

const STATUS_OK = String(new Response().status);
const EMAIL_RE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]+$/u;

const isEmailLike = (value: string): boolean => EMAIL_RE.test(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const joinPath = (path: string, segment: string | number): string => {
	if (typeof segment === 'number') return `${path}[${segment}]`;
	return path === '$' ? `$.${segment}` : `${path}.${segment}`;
};

const schemaExtras = (schema: IJsonSchema): IJsonSchemaLike =>
	schema as IJsonSchemaLike;

const inferType = (schema: IJsonSchema): IJsonSchema['type'] | undefined => {
	if (schema.type !== undefined) return schema.type;
	const extra = schemaExtras(schema);
	if (
		schema.properties !== undefined ||
		schema.required !== undefined ||
		extra.additionalProperties !== undefined
	) {
		return 'object';
	}
	if (schema.items !== undefined) return 'array';
	return undefined;
};

const detectType = (value: unknown): string => {
	if (value === undefined) return 'undefined';
	const detected = detectValueType(value);
	return detected === 'unknown' ? typeof value : detected;
};

const TYPE_CHECKERS: Readonly<
	Record<NonNullable<IJsonSchema['type']>, (value: unknown) => boolean>
> = {
	string: (value) => typeof value === 'string',
	number: (value) => typeof value === 'number' && Number.isFinite(value),
	integer: (value) => typeof value === 'number' && Number.isInteger(value),
	boolean: (value) => typeof value === 'boolean',
	array: (value) => Array.isArray(value),
	object: (value) => isPlainObject(value),
	null: (value) => value === null,
};

const matchesType = (
	value: unknown,
	expected: NonNullable<IJsonSchema['type']>,
) => TYPE_CHECKERS[expected]?.(value) ?? false;

const isNullable = (schema: IJsonSchema): boolean =>
	schemaExtras(schema).nullable === true;

const hasUnsupportedFeature = (
	schema: IJsonSchema,
): 'oneOf' | 'anyOf' | undefined => {
	const extra = schemaExtras(schema);
	if (Array.isArray(extra.oneOf) && extra.oneOf.length > 0) return 'oneOf';
	if (Array.isArray(extra.anyOf) && extra.anyOf.length > 0) return 'anyOf';
	return undefined;
};

const isValidFormat = (value: string, format: string): boolean => {
	switch (format) {
		case 'email':
			return isEmailLike(value);
		case 'uri':
			try {
				const url = new URL(value);
				return url.protocol.length > 1;
			} catch {
				return false;
			}
		default:
			return true;
	}
};

const formatFinding = (
	path: string,
	ruleId: string,
	severity: IFinding['severity'],
	message: string,
	fix?: string,
): IFinding => ({
	ruleId,
	severity,
	message: `${path}: ${message}`,
	...(fix === undefined ? {} : { fix }),
});

export const resolveResponseSchema = (
	operation: IOpenApiOperation,
): IJsonSchema | undefined => {
	const exact200 = operation.responses.find(
		(response) => response.status === STATUS_OK,
	);
	if (exact200?.schema !== undefined) return exact200.schema;
	const success = operation.responses.find(
		(response) =>
			/^2\d\d$/u.test(response.status) && response.schema !== undefined,
	);
	if (success?.schema !== undefined) return success.schema;
	return operation.responses.find((response) => response.status === 'default')
		?.schema;
};

const validateValue = (
	schema: IJsonSchema,
	value: unknown,
	path: string,
): IFinding[] => {
	const unsupported = hasUnsupportedFeature(schema);
	if (unsupported !== undefined) {
		throw new Error(
			`unsupported-schema-feature: ${unsupported} at ${path}`,
		);
	}
	if (value === null && isNullable(schema)) return [];

	const expectedType = inferType(schema);
	if (expectedType !== undefined && !matchesType(value, expectedType)) {
		return [
			formatFinding(
				path,
				'type-mismatch',
				path === '$' && expectedType === 'object' ? 'critical' : 'high',
				`expected ${expectedType} but received ${detectType(value)}.`,
				`Adjust the value at ${path} to match the schema type ${expectedType}.`,
			),
		];
	}

	if (schema.enum !== undefined && !schema.enum.includes(value as never)) {
		return [
			formatFinding(
				path,
				'enum-out-of-range',
				'medium',
				`value ${JSON.stringify(value)} is not in enum ${JSON.stringify(schema.enum)}.`,
				'Use one of the allowed enum values from the schema.',
			),
		];
	}

	if (
		typeof value === 'string' &&
		typeof schema.format === 'string' &&
		!isValidFormat(value, schema.format)
	) {
		return [
			formatFinding(
				path,
				'format-mismatch',
				'medium',
				`expected format ${schema.format} but received ${JSON.stringify(value)}.`,
				`Provide a value that matches the ${schema.format} format.`,
			),
		];
	}

	if (Array.isArray(value)) {
		if (schema.items === undefined) return [];
		return value.flatMap((item, index) =>
			validateValue(
				schema.items as IJsonSchema,
				item,
				joinPath(path, index),
			),
		);
	}

	if (!isPlainObject(value)) return [];

	const findings: IFinding[] = [];
	const properties = schema.properties ?? {};
	for (const required of schema.required ?? []) {
		if (value[required] !== undefined) continue;
		findings.push(
			formatFinding(
				joinPath(path, required),
				'missing-required-field',
				'critical',
				`missing required field ${JSON.stringify(required)}.`,
				`Add the required field ${JSON.stringify(required)}.`,
			),
		);
	}

	const additionalProperties = schemaExtras(schema).additionalProperties;
	for (const [key, childValue] of Object.entries(value)) {
		const childSchema = properties[key];
		const childPath = joinPath(path, key);
		if (childSchema !== undefined) {
			findings.push(...validateValue(childSchema, childValue, childPath));
			continue;
		}
		if (additionalProperties === false) {
			findings.push(
				formatFinding(
					childPath,
					'extra-property',
					'medium',
					'property is not declared in the schema.',
					'Remove the property or allow it in the schema.',
				),
			);
			continue;
		}
		if (isPlainObject(additionalProperties)) {
			findings.push(
				...validateValue(additionalProperties, childValue, childPath),
			);
		}
	}

	return findings;
};

export const validateResponse = (
	operation: IOpenApiOperation,
	response: unknown,
	options: IValidateResponseOptions = {},
): readonly IFinding[] => {
	const schema = options.schema ?? resolveResponseSchema(operation);
	if (schema === undefined) return [];
	return validateValue(schema, response, '$');
};

export const _internal = {
	detectType,
	hasUnsupportedFeature,
	inferType,
	isNullable,
	isValidFormat,
	joinPath,
	matchesType,
	validateValue,
};
