/**
 * f00130 S1 — Pure request builder.
 *
 * Given an `IOpenApiOperation` and a value bag of `params` + `body`,
 * produce the fully-substituted `{ method, url, headers, body? }`
 * that `webFetch` can send. The builder is pure (no I/O, no
 * network) so the same spec + inputs always produce the same
 * request — easy to assert in unit tests, easy to cache.
 */
import type {
	IOpenApiOperation,
	IOperationParam,
	IJsonSchema,
} from './openapi';

export interface IBuildRequestInput {
	readonly operation: IOpenApiOperation;
	/** Param values, keyed by `param.name`, wherever the spec places them. */
	readonly params?: Readonly<Record<string, string | number | boolean>>;
	/** JSON body for operations with a JSON request body. */
	readonly body?: unknown;
	/** Server override; takes precedence over the spec's servers. */
	readonly baseUrl?: string;
	/** Spec-level server list (a fallback when `baseUrl` is omitted). */
	readonly specServers?: readonly string[];
}

export interface IBuiltRequest {
	readonly method: IOpenApiOperation['method'];
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	/** Stringified JSON body, or undefined. */
	readonly body?: string;
}

const stripTrailingSlash = (s: string): string => {
	let end = s.length;
	while (end > 0 && s[end - 1] === '/') end -= 1;
	return end === s.length ? s : s.slice(0, end);
};

const substitutePath = (
	template: string,
	pathParams: readonly IOperationParam[],
): string => {
	let out = template;
	for (const p of pathParams) {
		const re = new RegExp(`\\{${escapeRegExp(p.name)}\\}`, 'g');
		out = out.replace(re, '{param}');
	}
	return out;
};

const escapeRegExp = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildQuery = (
	queryParams: readonly IOperationParam[],
	values: Readonly<Record<string, string | number | boolean>>,
): string => {
	const out: string[] = [];
	for (const p of queryParams) {
		const v = values[p.name];
		if (v === undefined) {
			if (p.required)
				throw new Error(`missing required query parameter: ${p.name}`);
			continue;
		}
		out.push(
			`${encodeURIComponent(p.name)}=${encodeURIComponent(String(v))}`,
		);
	}
	return out.length === 0 ? '' : `?${out.join('&')}`;
};

const buildHeaders = (
	headerParams: readonly IOperationParam[],
	values: Readonly<Record<string, string | number | boolean>>,
	contentType: string | undefined,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (contentType !== undefined) headers['content-type'] = contentType;
	for (const p of headerParams) {
		const v = values[p.name];
		if (v === undefined) {
			if (p.required)
				throw new Error(`missing required header parameter: ${p.name}`);
			continue;
		}
		headers[p.name.toLowerCase()] = String(v);
	}
	return headers;
};

/** Cookie parameters share one `cookie` header. */
const buildCookie = (
	cookieParams: readonly IOperationParam[],
	values: Readonly<Record<string, string | number | boolean>>,
): Record<string, string> => {
	const pairs: string[] = [];
	for (const p of cookieParams) {
		const v = values[p.name];
		if (v === undefined) {
			if (p.required)
				throw new Error(`missing required cookie parameter: ${p.name}`);
			continue;
		}
		pairs.push(`${p.name}=${encodeURIComponent(String(v))}`);
	}
	return pairs.length === 0 ? {} : { cookie: pairs.join('; ') };
};

const JSON_CONTENT_TYPE = /^application\/(?:[\w.-]+\+)?json\b/u;

/** The body a request carries, or a refusal when the spec disagrees. */
const buildBody = (
	operation: IOpenApiOperation,
	body: unknown,
): string | undefined => {
	const declared = operation.requestBody;
	if (body === undefined) {
		if (declared?.required === true) {
			throw new Error(
				`missing required request body (${declared.contentType})`,
			);
		}
		return undefined;
	}
	if (declared === undefined) {
		throw new Error(
			`${operation.operationId} declares no request body; remove \`body\``,
		);
	}
	if (!JSON_CONTENT_TYPE.test(declared.contentType)) {
		throw new Error(
			`request body must be ${declared.contentType}; api_call sends JSON only`,
		);
	}
	return JSON.stringify(body);
};

/**
 * Coerce `value` to the JSON type that `schema` expects, when
 * the schema declares a primitive. Best-effort — strict
 * contract validation is S2 territory.
 */
export const coerceValue = (
	schema: IJsonSchema | undefined,
	value: unknown,
): unknown => {
	if (schema === undefined || schema.type === undefined) return value;
	if (schema.type === 'integer' || schema.type === 'number') {
		const n = typeof value === 'string' ? Number(value) : (value as number);
		return Number.isFinite(n) ? n : value;
	}
	if (schema.type === 'boolean') {
		if (typeof value === 'boolean') return value;
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	}
	return value;
};

/**
 * Build the request. Throws when the input cannot be the request the
 * spec describes: a missing required parameter or body, or a body the
 * operation has no place for. A missing optional value is left out.
 */
export const buildRequest = (input: IBuildRequestInput): IBuiltRequest => {
	const { operation, params = {}, body, baseUrl } = input;
	const pathParams = operation.parameters.filter((p) => p.in === 'path');
	const queryParams = operation.parameters.filter((p) => p.in === 'query');
	const headerParams = operation.parameters.filter((p) => p.in === 'header');
	const cookieParams = operation.parameters.filter((p) => p.in === 'cookie');

	// Substitute path params.
	let path = operation.path;
	for (const p of pathParams) {
		const v = params[p.name];
		if (v === undefined) {
			if (p.required)
				throw new Error(`missing required path parameter: ${p.name}`);
			continue;
		}
		const re = new RegExp(`\\{${escapeRegExp(p.name)}\\}`, 'g');
		path = path.replace(re, encodeURIComponent(String(v)));
	}
	// If any template slots survived, the caller didn't satisfy a required path param.
	if (/\{[a-zA-Z_][\w]*\}/.test(path)) {
		throw new Error(`path template not fully substituted: ${path}`);
	}

	const server =
		baseUrl !== undefined && baseUrl.length > 0
			? baseUrl
			: (input.specServers?.[0] ?? '');
	const base = stripTrailingSlash(server);
	const url = `${base}${path.startsWith('/') ? path : `/${path}`}${buildQuery(queryParams, params)}`;

	const requestBody = buildBody(operation, body);
	const headers = {
		...buildHeaders(
			headerParams,
			params,
			requestBody === undefined
				? undefined
				: operation.requestBody?.contentType,
		),
		...buildCookie(cookieParams, params),
	};

	const out: {
		method: IBuiltRequest['method'];
		url: string;
		headers: Readonly<Record<string, string>>;
		body?: string;
	} = {
		method: operation.method,
		url,
		headers,
	};
	if (requestBody !== undefined) out.body = requestBody;
	return out;
};

/** Internal helper for the test suite. */
export const _internal = {
	substitutePath,
	buildQuery,
	buildHeaders,
	buildCookie,
};
