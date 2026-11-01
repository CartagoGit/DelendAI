/**
 * f00130 S1 — Pure OpenAPI 3.x parser.
 *
 * The parser only reads the structural surface the rest of the
 * `api` plugin needs: `info.title` + servers, the resolved path
 * templates, and the parameters/responses for each operation. Local
 * `$ref`s are expanded first; anything else is named in `parseNote`.
 *
 * The output shape `IOpenApiSpec` is what the rest of the plugin
 * (request builder, contract validator, mock generator) consumes.
 * Pure data — no I/O, no spawn.
 */
import { webFetch } from '@delendai/web-fetch/public';

import { dereference } from './dereference';
import type {
	ILoadedSpec,
	ILoadSpecOptions,
} from '../contracts/interfaces/load-spec.interface';

export type {
	ILoadedSpec,
	ILoadSpecOptions,
} from '../contracts/interfaces/load-spec.interface';

/** A primitive type known to JSON Schema (OpenAPI inherits JSON Schema). */
export type IJsonSchemaPrimitive =
	| 'string'
	| 'number'
	| 'integer'
	| 'boolean'
	| 'object'
	| 'array'
	| 'null';

/** Minimal JSON Schema shape the request builder cares about. */
export interface IJsonSchema {
	readonly type?: IJsonSchemaPrimitive;
	readonly format?: string;
	readonly enum?: readonly (string | number | boolean)[];
	readonly properties?: Readonly<Record<string, IJsonSchema>>;
	readonly required?: readonly string[];
	readonly items?: IJsonSchema;
	readonly description?: string;
	readonly example?: unknown;
	/**
	 * Numeric bounds (JSON Schema). Consumed by the S3 mock
	 * generator; ignored by the request builder.
	 */
	readonly minimum?: number;
	readonly maximum?: number;
	readonly exclusiveMinimum?: number;
	readonly exclusiveMaximum?: number;
	/**
	 * Array bounds (JSON Schema). Consumed by the S3 mock generator.
	 */
	readonly minItems?: number;
	readonly maxItems?: number;
	/** String bounds (JSON Schema). */
	readonly minLength?: number;
	readonly maxLength?: number;
	/** `null` is a valid value (OpenAPI 3.0 flag, or 3.1 `type: [.., 'null']`). */
	readonly nullable?: boolean;
	readonly additionalProperties?: boolean | IJsonSchema;
	/** Kept so the validator can refuse them instead of passing everything. */
	readonly oneOf?: readonly IJsonSchema[];
	readonly anyOf?: readonly IJsonSchema[];
}

/** Where a parameter lives. */
export type IParamIn = 'path' | 'query' | 'header' | 'cookie';

/** A single parameter for an operation. */
export interface IOperationParam {
	readonly name: string;
	readonly in: IParamIn;
	readonly required: boolean;
	readonly schema: IJsonSchema;
	readonly description?: string;
}

/** A single response definition. */
export interface IOperationResponse {
	readonly status: string;
	readonly description: string;
	readonly contentType?: string;
	readonly schema?: IJsonSchema;
}

/** A single API operation, indexed by `operationId`. */
export interface IOpenApiOperation {
	readonly operationId: string;
	readonly method:
		| 'GET'
		| 'POST'
		| 'PUT'
		| 'PATCH'
		| 'DELETE'
		| 'HEAD'
		| 'OPTIONS';
	readonly path: string;
	readonly summary?: string;
	readonly description?: string;
	readonly parameters: readonly IOperationParam[];
	readonly requestBody?: {
		readonly required: boolean;
		readonly contentType: string;
		readonly schema: IJsonSchema;
	};
	readonly responses: readonly IOperationResponse[];
	readonly tags: readonly string[];
}

/** The full parsed spec. */
export interface IOpenApiSpec {
	readonly title: string;
	readonly version: string;
	readonly servers: readonly string[];
	readonly operations: Readonly<Record<string, IOpenApiOperation>>;
	/** A short, line-1 description of the parse for diagnostics. */
	readonly parseNote: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const lower = (
	s: string,
): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' => {
	const u = s.toUpperCase();
	switch (u) {
		case 'GET':
		case 'POST':
		case 'PUT':
		case 'PATCH':
		case 'DELETE':
		case 'HEAD':
		case 'OPTIONS':
			return u;
		default:
			return 'GET';
	}
};

const parseServers = (raw: unknown): readonly string[] => {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const s of raw) {
		if (isPlainObject(s) && typeof s.url === 'string') {
			out.push(s.url);
		}
	}
	return out;
};

/** A 3.1 `type: ['string', 'null']` is a nullable string. */
const parseType = (raw: unknown): Pick<IJsonSchema, 'type' | 'nullable'> => {
	if (typeof raw === 'string') return { type: raw as IJsonSchemaPrimitive };
	if (!Array.isArray(raw)) return {};
	const named = raw.filter((t): t is string => typeof t === 'string');
	const concrete = named.filter((t) => t !== 'null');
	return {
		...(concrete.length === 1
			? { type: concrete[0] as IJsonSchemaPrimitive }
			: {}),
		...(concrete.length === named.length ? {} : { nullable: true }),
	};
};

/** OpenAPI 3.0 spells an exclusive bound as a boolean beside the bound. */
const parseBounds = (
	raw: Record<string, unknown>,
): Pick<
	IJsonSchema,
	'minimum' | 'maximum' | 'exclusiveMinimum' | 'exclusiveMaximum'
> => {
	const bound = (
		inclusive: unknown,
		exclusive: unknown,
		inclusiveKey: 'minimum' | 'maximum',
		exclusiveKey: 'exclusiveMinimum' | 'exclusiveMaximum',
	) => ({
		...(typeof inclusive === 'number' && exclusive !== true
			? { [inclusiveKey]: inclusive }
			: {}),
		...(typeof exclusive === 'number' ? { [exclusiveKey]: exclusive } : {}),
		...(typeof inclusive === 'number' && exclusive === true
			? { [exclusiveKey]: inclusive }
			: {}),
	});
	return {
		...bound(
			raw.minimum,
			raw.exclusiveMinimum,
			'minimum',
			'exclusiveMinimum',
		),
		...bound(
			raw.maximum,
			raw.exclusiveMaximum,
			'maximum',
			'exclusiveMaximum',
		),
	};
};

const parseSchemas = (raw: unknown): readonly IJsonSchema[] | undefined =>
	Array.isArray(raw) ? raw.map(parseSchema) : undefined;

const parseSchema = (raw: unknown): IJsonSchema => {
	if (!isPlainObject(raw)) return {};
	const out: {
		type?: IJsonSchemaPrimitive;
		format?: string;
		enum?: readonly (string | number | boolean)[];
		properties?: Readonly<Record<string, IJsonSchema>>;
		required?: readonly string[];
		items?: IJsonSchema;
		description?: string;
		example?: unknown;
		minItems?: number;
		maxItems?: number;
		minLength?: number;
		maxLength?: number;
		nullable?: boolean;
		additionalProperties?: boolean | IJsonSchema;
		oneOf?: readonly IJsonSchema[];
		anyOf?: readonly IJsonSchema[];
	} = { ...parseType(raw.type) };
	if (typeof raw.format === 'string') out.format = raw.format;
	if (Array.isArray(raw.enum))
		out.enum = raw.enum as readonly (string | number | boolean)[];
	if (isPlainObject(raw.properties)) {
		const props: Record<string, IJsonSchema> = {};
		for (const [k, v] of Object.entries(raw.properties)) {
			props[k] = parseSchema(v);
		}
		out.properties = props;
	}
	if (Array.isArray(raw.required)) {
		out.required = (raw.required as unknown[]).filter(
			(x): x is string => typeof x === 'string',
		);
	}
	if (isPlainObject(raw.items)) {
		out.items = parseSchema(raw.items);
	}
	if (typeof raw.description === 'string') out.description = raw.description;
	if ('example' in raw) out.example = raw.example;
	if (typeof raw.minItems === 'number') out.minItems = raw.minItems;
	if (typeof raw.maxItems === 'number') out.maxItems = raw.maxItems;
	if (typeof raw.minLength === 'number') out.minLength = raw.minLength;
	if (typeof raw.maxLength === 'number') out.maxLength = raw.maxLength;
	if (raw.nullable === true) out.nullable = true;
	if (typeof raw.additionalProperties === 'boolean') {
		out.additionalProperties = raw.additionalProperties;
	} else if (isPlainObject(raw.additionalProperties)) {
		out.additionalProperties = parseSchema(raw.additionalProperties);
	}
	const oneOf = parseSchemas(raw.oneOf);
	if (oneOf !== undefined) out.oneOf = oneOf;
	const anyOf = parseSchemas(raw.anyOf);
	if (anyOf !== undefined) out.anyOf = anyOf;
	return { ...out, ...parseBounds(raw) } as IJsonSchema;
};

const parseParam = (raw: unknown): IOperationParam | undefined => {
	if (!isPlainObject(raw)) return undefined;
	if (typeof raw.name !== 'string') return undefined;
	const inRaw = typeof raw.in === 'string' ? raw.in : 'query';
	if (
		inRaw !== 'path' &&
		inRaw !== 'query' &&
		inRaw !== 'header' &&
		inRaw !== 'cookie'
	) {
		return undefined;
	}
	return {
		name: raw.name,
		in: inRaw,
		required: raw.required === true,
		schema: parseSchema(raw.schema),
		...(typeof raw.description === 'string'
			? { description: raw.description }
			: {}),
	};
};

const parseRequestBody = (
	raw: unknown,
):
	| { required: boolean; contentType: string; schema: IJsonSchema }
	| undefined => {
	if (!isPlainObject(raw)) return undefined;
	const content = raw.content;
	if (!isPlainObject(content)) return undefined;
	const jsonEntry = content['application/json'];
	if (isPlainObject(jsonEntry)) {
		return {
			required: raw.required === true,
			contentType: 'application/json',
			schema: parseSchema(jsonEntry.schema),
		};
	}
	// A body the plugin cannot send is still a body the operation requires.
	const [contentType] = Object.keys(content);
	if (contentType === undefined) return undefined;
	return {
		required: raw.required === true,
		contentType,
		schema: parseSchema(
			(content[contentType] as { schema?: unknown })?.schema,
		),
	};
};

const parseResponses = (raw: unknown): readonly IOperationResponse[] => {
	if (!isPlainObject(raw)) return [];
	const out: IOperationResponse[] = [];
	for (const [status, value] of Object.entries(raw)) {
		if (!isPlainObject(value)) continue;
		const content = value.content;
		let contentType: string | undefined;
		let schema: IJsonSchema | undefined;
		if (isPlainObject(content)) {
			const jsonEntry = content['application/json'];
			if (isPlainObject(jsonEntry)) {
				contentType = 'application/json';
				schema = parseSchema(jsonEntry.schema);
			}
		}
		out.push({
			status,
			description:
				typeof value.description === 'string' ? value.description : '',
			...(contentType !== undefined ? { contentType } : {}),
			...(schema !== undefined ? { schema } : {}),
		});
	}
	return out;
};

/**
 * Parse a JSON-encoded OpenAPI 3.x spec. Pure: never throws on
 * malformed input — returns a spec with `parseNote` describing what
 * went wrong.
 */
export const parseOpenApi = (input: string | object): IOpenApiSpec => {
	let raw: unknown;
	if (typeof input === 'string') {
		try {
			raw = JSON.parse(input);
		} catch {
			return {
				title: '',
				version: '',
				servers: [],
				operations: {},
				parseNote: 'input is not valid JSON',
			};
		}
	} else {
		raw = input;
	}
	if (!isPlainObject(raw)) {
		return {
			title: '',
			version: '',
			servers: [],
			operations: {},
			parseNote: 'input is not an object',
		};
	}
	const { paths: pathsRaw, unresolved } = dereference(raw);
	const defaultNote =
		unresolved === 0
			? 'parsed'
			: `parsed; ${String(unresolved)} $ref could not be followed and constrain nothing`;
	const infoRaw = raw.info;
	const info = isPlainObject(infoRaw) ? infoRaw : {};
	const title = typeof info.title === 'string' ? info.title : '';
	const version = typeof info.version === 'string' ? info.version : '';
	const servers = parseServers(raw.servers);
	const operations: Record<string, IOpenApiOperation> = {};
	if (!isPlainObject(pathsRaw)) {
		return { title, version, servers, operations, parseNote: 'no paths' };
	}
	const HTTP_METHODS = [
		'get',
		'post',
		'put',
		'patch',
		'delete',
		'head',
		'options',
	] as const;
	for (const [path, pathItem] of Object.entries(pathsRaw)) {
		if (!isPlainObject(pathItem)) continue;
		const pathLevelParams = Array.isArray(pathItem.parameters)
			? (pathItem.parameters as unknown[])
					.map(parseParam)
					.filter((p): p is IOperationParam => p !== undefined)
			: [];
		for (const method of HTTP_METHODS) {
			const op = pathItem[method];
			if (!isPlainObject(op)) continue;
			if (typeof op.operationId !== 'string') continue;
			const opParams = Array.isArray(op.parameters)
				? (op.parameters as unknown[])
						.map(parseParam)
						.filter((p): p is IOperationParam => p !== undefined)
				: [];
			const params = [...pathLevelParams, ...opParams];
			const requestBody = parseRequestBody(op.requestBody);
			const responses = parseResponses(op.responses);
			const tags = Array.isArray(op.tags)
				? (op.tags as unknown[]).filter(
						(t): t is string => typeof t === 'string',
					)
				: [];
			operations[op.operationId] = {
				operationId: op.operationId,
				method: lower(method),
				path,
				...(typeof op.summary === 'string'
					? { summary: op.summary }
					: {}),
				...(typeof op.description === 'string'
					? { description: op.description }
					: {}),
				parameters: params,
				...(requestBody !== undefined ? { requestBody } : {}),
				responses,
				tags,
			};
		}
	}
	return { title, version, servers, operations, parseNote: defaultNote };
};

/** The first HTTP status that is an error, not a spec. */
const HTTP_ERROR_MIN = 400;

/**
 * Fetch a spec URL through the web-fetch engine, under its allow-list,
 * timeout and byte cap. It used to call `fetch` itself and read the body
 * to the end, so a spec URL reached any host and any size.
 */
export const fetchAndParseSpec = async (
	options: ILoadSpecOptions,
): Promise<ILoadedSpec> => {
	const request = {
		url: options.url,
		allowList: options.allowList,
		headers: { Accept: 'application/json' },
		...(options.maxBytes === undefined
			? {}
			: { maxBytes: options.maxBytes }),
		...(options.timeoutMs === undefined
			? {}
			: { timeoutMs: options.timeoutMs }),
	};
	const result = await (options.engine ?? webFetch)(
		request,
		...(options.fetch === undefined ? [] : [options.fetch]),
	);
	if (!result.ok) {
		return {
			ok: false,
			reason: `${result.reason}${result.detail === undefined ? '' : ` (${result.detail})`}`,
		};
	}
	// Half a spec parses into a different API: a capped body is refused.
	if (result.truncated) {
		return {
			ok: false,
			reason: 'the spec is larger than maxBytes; raise maxBytes or pass it inline',
		};
	}
	if (result.status >= HTTP_ERROR_MIN) {
		return { ok: false, reason: `status ${String(result.status)}` };
	}
	return { ok: true, spec: parseOpenApi(result.body), status: result.status };
};
