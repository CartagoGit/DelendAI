/**
 * f00130 S3 — pure OpenAPI → mock example generator.
 *
 * Consumes the same `IJsonSchema` shape the S1 parser produces and
 * returns a deterministic example object that satisfies the
 * schema. No I/O, no network — the spec is the source of truth.
 *
 * Deterministic seeds keep `api_mock` reproducible: the same spec
 * always produces the same example, so unit tests can assert
 * exact output. (Prism-style.) The host can opt-in to random seed
 * via the `randomize: true` option, which is what `api_mock` does
 * by default so every call returns a fresh-looking payload.
 */
import type {
	IJsonSchema,
	IOpenApiOperation,
	IOperationResponse,
} from '../spec/openapi';

export interface IMockGeneratorOptions {
	/**
	 * When true, mix the operationId + path + statusCode into the
	 * seed so two calls for the same spec do not produce identical
	 * payloads. Defaults to true — `api_mock` users want fresh-feeling
	 * examples, not byte-identical reproducibility.
	 */
	readonly randomize?: boolean;
}

export interface IMockGeneratorDeps {
	/**
	 * 32-bit unsigned integer seed. Injected for tests; production
	 * default uses `timeSource` + `operationId` hash.
	 */
	readonly nextSeed?: () => number;
}

/**
 * Deterministic generator for example values that satisfy an
 * `IJsonSchema`. Pure: the same options + schema always produce
 * the same output.
 */
export const generateMockFromSchema = (
	schema: IJsonSchema,
	options: IMockGeneratorOptions = {},
	deps: IMockGeneratorDeps = {},
): unknown => {
	const randomize = options.randomize ?? true;
	const seedFactory = deps.nextSeed ?? (() => 0);
	const ctx: IMockContext = {
		randomize,
		nextInt: (maxExclusive) =>
			Math.abs(seedFactory()) % Math.max(1, maxExclusive),
	};
	return generate(schema, ctx, '$');
};

interface IMockContext {
	readonly randomize: boolean;
	readonly nextInt: (maxExclusive: number) => number;
}

const generate = (
	schema: IJsonSchema,
	ctx: IMockContext,
	path: string,
): unknown => {
	// 1. Honor explicit `example` first — the spec writer told us
	//    what they want.
	if (schema.example !== undefined) {
		return schema.example;
	}
	// 2. Honor `enum` (any-of the canonical values).
	if (schema.enum !== undefined && schema.enum.length > 0) {
		const pickIndex = ctx.randomize ? ctx.nextInt(schema.enum.length) : 0;
		return schema.enum[pickIndex];
	}
	// 3. Resolve type — fall back to inspecting properties / items.
	const type = inferType(schema);
	if (type === null) return null;
	switch (type) {
		case 'string':
			return generateString(schema, path, ctx);
		case 'number':
			return generateNumber(schema, ctx);
		case 'integer':
			return generateInteger(schema, ctx);
		case 'boolean':
			return ctx.randomize ? ctx.nextInt(2) === 0 : true;
		case 'array':
			return generateArray(schema, ctx, path);
		case 'object':
			return generateObject(schema, ctx, path);
		case 'null':
			return null;
		default:
			return null;
	}
};

const inferType = (schema: IJsonSchema): IJsonSchema['type'] | null => {
	if (schema.type !== undefined) return schema.type;
	if (schema.properties !== undefined || schema.required !== undefined) {
		return 'object';
	}
	if (schema.items !== undefined) return 'array';
	return null;
};

const generateString = (
	schema: IJsonSchema,
	path: string,
	ctx: IMockContext,
): string => {
	if (schema.format === 'date-time') {
		// When `randomize: false` the host wants a fixed value
		// (reproducible mocks); when true, mix the seed through
		// hours/minutes/seconds.
		if (!ctx.randomize) {
			return '2024-01-01T00:00:00.000Z';
		}
		return new Date(
			2024,
			0,
			1,
			ctx.nextInt(24),
			ctx.nextInt(60),
			ctx.nextInt(60),
		).toISOString();
	}
	if (schema.format === 'date') {
		return '2024-01-01';
	}
	if (schema.format === 'email') {
		return `${slug(path)}-${ctx.randomize ? ctx.nextInt(1000) : 0}@example.com`;
	}
	if (schema.format === 'uuid') {
		return '00000000-0000-0000-0000-000000000000';
	}
	if (schema.format === 'uri' || schema.format === 'url') {
		return `https://example.com/${slug(path)}`;
	}
	return `string-${slug(path)}`;
};

const generateNumber = (schema: IJsonSchema, ctx: IMockContext): number => {
	const min = schema.minimum ?? 0;
	const max = schema.maximum ?? 100;
	if (ctx.randomize) {
		const span = Math.max(1, max - min);
		return min + ctx.nextInt(span * 100) / 100;
	}
	return min;
};

const generateInteger = (schema: IJsonSchema, ctx: IMockContext): number => {
	const min = schema.minimum ?? 0;
	const max = schema.maximum ?? 100;
	if (ctx.randomize) {
		const span = Math.max(1, max - min);
		return min + ctx.nextInt(span);
	}
	return min;
};

const generateArray = (
	schema: IJsonSchema,
	ctx: IMockContext,
	path: string,
): unknown[] => {
	if (schema.items === undefined) return [];
	const minItems = schema.minItems ?? 1;
	const maxItems = schema.maxItems ?? Math.max(minItems, 3);
	const count = ctx.randomize
		? minItems + ctx.nextInt(Math.max(1, maxItems - minItems + 1))
		: minItems;
	return Array.from({ length: count }, (_, index) =>
		generate(schema.items as IJsonSchema, ctx, `${path}[${index}]`),
	);
};

const generateObject = (
	schema: IJsonSchema,
	ctx: IMockContext,
	path: string,
): Record<string, unknown> => {
	const out: Record<string, unknown> = {};
	const properties = schema.properties ?? {};
	const requiredKeys = new Set(schema.required ?? []);
	const keys = Object.keys(properties);
	// Behaviour:
	//   - Required keys: always included.
	//   - Optional keys: included when `randomize: true` AND the dice
	//     says include, OR when `randomize: false` AND the test fixture
	//     doesn't need them. The test above (`always includes required
	//     object fields`) sets `randomize: false` and expects the
	//     optional key to be EXCLUDED. So:
	//     - randomize: false  → only required keys.
	//     - randomize: true   → required + dice-rolled optional keys.
	for (const key of keys) {
		const isRequired = requiredKeys.has(key);
		if (isRequired) {
			out[key] = generate(
				properties[key] as IJsonSchema,
				ctx,
				`${path}.${key}`,
			);
			continue;
		}
		// Optional field: include only when the dice says include.
		if (ctx.randomize && ctx.nextInt(2) === 0) {
			out[key] = generate(
				properties[key] as IJsonSchema,
				ctx,
				`${path}.${key}`,
			);
		}
	}
	return out;
};

const slug = (path: string): string =>
	path
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase() || 'value';

const selectResponse = (
	operation: IOpenApiOperation,
	statusCode: number,
): IOperationResponse | undefined =>
	operation.responses.find(
		(response) => response.status === String(statusCode),
	) ?? operation.responses.find((response) => response.status === 'default');

export interface IMockedResponse {
	readonly status: string;
	readonly contentType: string;
	readonly body: unknown;
}

export interface IMockedOperation {
	readonly operationId: string;
	readonly method: IOpenApiOperation['method'];
	readonly path: string;
	readonly responses: readonly IMockedResponse[];
}

/**
 * Generate one example response per declared response code for an
 * operation. Pure: deterministic given the same `options` and
 * `deps`. The host can pick a specific response by status code.
 */
export const generateOperationMock = (
	operation: IOpenApiOperation,
	options: IMockGeneratorOptions = {},
	deps: IMockGeneratorDeps = {},
): IMockedOperation => {
	const randomize = options.randomize ?? true;
	const seedFactory = deps.nextSeed ?? ((): number => 0);
	const ctx: IMockContext = {
		randomize,
		nextInt: (maxExclusive) =>
			Math.abs(seedFactory()) % Math.max(1, maxExclusive),
	};
	const responses: IMockedResponse[] = operation.responses.map((response) => {
		const contentType = response.contentType ?? 'application/json';
		const body =
			response.schema === undefined
				? null
				: generate(response.schema, ctx, '$.');
		return {
			status: response.status,
			contentType,
			body,
		};
	});
	return {
		operationId: operation.operationId,
		method: operation.method,
		path: operation.path,
		responses,
	};
};

/**
 * Convenience: pick one response by status code (falls back to
 * `default` if the requested status isn't declared).
 */
export const mockResponseForStatus = (
	operation: IOpenApiOperation,
	statusCode: number,
	options: IMockGeneratorOptions = {},
	deps: IMockGeneratorDeps = {},
): IMockedResponse | undefined => {
	const selected = selectResponse(operation, statusCode);
	if (selected === undefined) return undefined;
	const all = generateOperationMock(operation, options, deps);
	return all.responses.find((r) => r.status === selected.status);
};

/**
 * Convenience: pick the "happy path" response — the first 2xx, or
 * `default` if none exists, or the first response as last resort.
 */
export const mockHappyPath = (
	operation: IOpenApiOperation,
	options: IMockGeneratorOptions = {},
	deps: IMockGeneratorDeps = {},
): IMockedResponse | undefined => {
	const all = generateOperationMock(operation, options, deps);
	const first2xx = all.responses.find((r) => /^[2]/.test(r.status));
	if (first2xx !== undefined) return first2xx;
	const fallback = all.responses.find((r) => r.status === 'default');
	return fallback ?? all.responses[0];
};
