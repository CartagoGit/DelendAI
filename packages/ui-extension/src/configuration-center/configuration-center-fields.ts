import type { ConfigurationPathSegment } from '@mcp-vertex/client';

import type { IConfigurationField } from '../contracts/interfaces/configuration-center.interface';

type JsonObject = Readonly<Record<string, unknown>>;

const objectOf = (value: unknown): JsonObject | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;

const propertiesOf = (schema: JsonObject): JsonObject =>
	objectOf(schema.properties) ?? {};

const requiredOf = (schema: JsonObject): ReadonlySet<string> =>
	new Set(
		Array.isArray(schema.required)
			? schema.required.filter(
					(entry): entry is string => typeof entry === 'string',
				)
			: [],
	);

const labelOf = (key: string, schema: JsonObject): string =>
	typeof schema.title === 'string' ? schema.title : key;

const descriptionOf = (schema: JsonObject): string | undefined =>
	typeof schema.description === 'string' ? schema.description : undefined;

const fieldId = (path: readonly ConfigurationPathSegment[]): string =>
	`field-${path
		.map(String)
		.join('-')
		.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;

export const containsRedactedValue = (value: unknown): boolean => {
	try {
		return JSON.stringify(value)?.includes('"[REDACTED]"') ?? false;
	} catch {
		return true;
	}
};

const scalarField = (
	key: string,
	schema: JsonObject,
	value: unknown,
	path: readonly ConfigurationPathSegment[],
	required: boolean,
	known: boolean,
): IConfigurationField => {
	const choices = Array.isArray(schema.enum)
		? schema.enum.filter(
				(entry): entry is string => typeof entry === 'string',
			)
		: [];
	const type = schema.type;
	const description = descriptionOf(schema);
	const kind =
		choices.length > 0
			? 'select'
			: type === 'boolean'
				? 'boolean'
				: type === 'number' || type === 'integer'
					? 'number'
					: type === 'string'
						? 'text'
						: type === 'array' || type === 'object'
							? 'json'
							: 'unsupported';
	return {
		id: fieldId(path),
		path,
		label: labelOf(key, schema),
		...(description === undefined ? {} : { description }),
		kind,
		value,
		...(choices.length === 0 ? {} : { choices }),
		required,
		readOnly: containsRedactedValue(value),
		known,
	};
};

const collectFields = (
	schema: JsonObject,
	value: JsonObject,
	basePath: readonly ConfigurationPathSegment[],
): IConfigurationField[] => {
	const properties = propertiesOf(schema);
	const required = requiredOf(schema);
	const fields: IConfigurationField[] = [];
	for (const key of Object.keys(properties).sort()) {
		const propertySchema = objectOf(properties[key]) ?? {};
		const propertyValue = value[key];
		const path = [...basePath, key];
		const nestedProperties = propertiesOf(propertySchema);
		if (
			propertySchema.type === 'object' &&
			Object.keys(nestedProperties).length > 0
		) {
			fields.push(
				...collectFields(
					propertySchema,
					objectOf(propertyValue) ?? {},
					path,
				),
			);
			continue;
		}
		fields.push(
			scalarField(
				key,
				propertySchema,
				propertyValue,
				path,
				required.has(key),
				true,
			),
		);
	}
	for (const key of Object.keys(value).sort()) {
		if (key in properties) continue;
		const path = [...basePath, key];
		fields.push(
			scalarField(
				key,
				{ type: 'object', description: 'Preserved extension field' },
				value[key],
				path,
				false,
				false,
			),
		);
	}
	return fields;
};

export const buildConfigurationFields = (
	schema: Readonly<Record<string, unknown>>,
	value: Readonly<Record<string, unknown>>,
	basePath: readonly ConfigurationPathSegment[] = [],
): readonly IConfigurationField[] => collectFields(schema, value, basePath);
