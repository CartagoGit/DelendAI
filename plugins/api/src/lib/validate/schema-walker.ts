import type { IFinding } from '@delendai/core/public';

import type { IJsonSchema } from '../spec/openapi';

import type { IFieldMismatch } from './interfaces';
import { checkType } from './type-matcher';

const joinPath = (path: string, segment: string | number): string => {
	if (typeof segment === 'number') return `${path}[${segment}]`;
	return path === '$.' ? `$.${segment}` : `${path}.${segment}`;
};

const toFinding = (mismatch: IFieldMismatch): IFinding => ({
	ruleId: mismatch.ruleId,
	severity: mismatch.severity,
	message: mismatch.message,
	...(mismatch.location !== undefined ? { location: mismatch.location } : {}),
	...(mismatch.fix !== undefined ? { fix: mismatch.fix } : {}),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const walkSchema = (
	value: unknown,
	schema: IJsonSchema,
	path = '$.',
): readonly IFieldMismatch[] => {
	const typeMismatch = checkType(value, schema, path);
	if (typeMismatch !== null) {
		return [
			{
				path,
				ruleId: 'type-mismatch',
				severity: typeMismatch.severity,
				message: typeMismatch.message,
				fix: `Adjust the value at ${path} to match the OpenAPI schema type ${typeMismatch.expected}.`,
			},
		];
	}

	if (schema.type === 'array' || schema.items !== undefined) {
		if (schema.items === undefined || !Array.isArray(value)) return [];
		const out: IFieldMismatch[] = [];
		for (const [index, item] of value.entries()) {
			out.push(...walkSchema(item, schema.items, joinPath(path, index)));
		}
		return out;
	}

	if (
		schema.type === 'object' ||
		schema.properties !== undefined ||
		schema.required !== undefined
	) {
		if (!isPlainObject(value)) return [];
		const out: IFieldMismatch[] = [];
		const properties = schema.properties ?? {};
		for (const requiredProperty of schema.required ?? []) {
			if (!(requiredProperty in value)) {
				const missingPath = joinPath(path, requiredProperty);
				out.push({
					path: missingPath,
					ruleId: 'missing-required-field',
					severity: 'critical',
					message: `${missingPath} is missing required field "${requiredProperty}".`,
					fix: `Add the required field "${requiredProperty}" at ${missingPath}.`,
				});
			}
		}
		for (const [key, childValue] of Object.entries(value)) {
			const childPath = joinPath(path, key);
			const childSchema = properties[key];
			if (childSchema === undefined) {
				out.push({
					path: childPath,
					ruleId: 'extra-field',
					severity: 'medium',
					message: `${childPath} is not declared in the OpenAPI schema.`,
					fix: `Remove ${childPath} or add it to the OpenAPI schema properties map.`,
				});
				continue;
			}
			out.push(...walkSchema(childValue, childSchema, childPath));
		}
		return out;
	}

	return [];
};

export const stripFieldPaths = (
	findings: readonly IFieldMismatch[],
): readonly IFinding[] => findings.map(toFinding);
