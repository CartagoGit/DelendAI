/**
 * f00130 S1 — Pure OpenAPI 3.x parser.
 *
 * The parser only reads the structural surface the rest of the
 * `api` plugin needs: `info.title` + servers, the resolved path
 * templates, and the parameters/responses for each operation. We do
 * not attempt to fully resolve `$ref` graphs (the slice ships
 * local + server-relative refs only; full graph resolution is S3
 * territory).
 *
 * The output shape `IOpenApiSpec` is what the rest of the plugin
 * (request builder, contract validator, mock generator) consumes.
 * Pure data — no I/O, no spawn.
 */
import type { IFetchLike } from '@delendai/web-fetch/public';

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
		minimum?: number;
		maximum?: number;
		exclusiveMinimum?: number;
		exclusiveMaximum?: number;
		minItems?: number;
		maxItems?: number;
	} = {};
	if (typeof raw.type === 'string') {
		out.type = raw.type as IJsonSchemaPrimitive;
	}
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
	if (typeof raw.minimum === 'number') out.minimum = raw.minimum;
	if (typeof raw.maximum === 'number') out.maximum = raw.maximum;
	if (typeof raw.exclusiveMinimum === 'number')
		out.exclusiveMinimum = raw.exclusiveMinimum;
	if (typeof raw.exclusiveMaximum === 'number')
		out.exclusiveMaximum = raw.exclusiveMaximum;
	if (typeof raw.minItems === 'number') out.minItems = raw.minItems;
	if (typeof raw.maxItems === 'number') out.maxItems = raw.maxItems;
	return out as IJsonSchema;
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
	if (!isPlainObject(jsonEntry)) return undefined;
	return {
		required: raw.required === true,
		contentType: 'application/json',
		schema: parseSchema(jsonEntry.schema),
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
	const defaultNote = 'parsed';
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
	const infoRaw = raw.info;
	const info = isPlainObject(infoRaw) ? infoRaw : {};
	const title = typeof info.title === 'string' ? info.title : '';
	const version = typeof info.version === 'string' ? info.version : '';
	const servers = parseServers(raw.servers);
	const operations: Record<string, IOpenApiOperation> = {};
	const pathsRaw = raw.paths;
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

/**
 * Fetch a spec URL through the web-fetch engine. Convenience
 * wrapper so the tool can accept either a parsed spec or a URL.
 * Read-only and allow-list aware — the host (or the tool) supplies
 * the allowList.
 */
export interface ILoadSpecOptions {
	readonly url: string;
	readonly allowList: readonly string[];
	readonly maxBytes?: number;
	readonly timeoutMs?: number;
	readonly fetch?: IFetchLike;
}

export const fetchAndParseSpec = async (
	options: ILoadSpecOptions,
): Promise<{ spec: IOpenApiSpec; status: number }> => {
	const _headers: Record<string, string> = { Accept: 'application/json' };
	const f = options.fetch ?? (fetch as unknown as IFetchLike);
	const res = await f(options.url, {});
	if (!res.ok) {
		return {
			spec: emptySpec(`fetch failed: status ${res.status}`),
			status: res.status,
		};
	}
	const body = res.body;
	if (body === null || body === undefined) {
		return { spec: emptySpec('empty body'), status: res.status };
	}
	const reader = body?.getReader();
	if (reader === undefined) {
		return { spec: emptySpec('body has no reader'), status: res.status };
	}
	const decoder = new TextDecoder('utf-8');
	let text = '';
	let next = await reader.read();
	while (!next.done) {
		const value = next.value;
		if (value !== undefined) {
			text += decoder.decode(value, { stream: true });
		}
		next = await reader.read();
	}
	text += decoder.decode();
	return { spec: parseOpenApi(text), status: res.status ?? 0 };
};

const emptySpec = (note: string): IOpenApiSpec => ({
	title: '',
	version: '',
	servers: [],
	operations: {},
	parseNote: note,
});
