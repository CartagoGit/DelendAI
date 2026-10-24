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
	/** Param values, keyed by `param.name`. `path`/`query`/`header` come from here. */
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
 * Build the request. Throws on a missing required `path` param —
 * every other missing value silently drops (matches OpenAPI
 * client behaviour; contract enforcement is S2).
 */
export const buildRequest = (input: IBuildRequestInput): IBuiltRequest => {
	const { operation, params = {}, body, baseUrl } = input;
	const pathParams = operation.parameters.filter((p) => p.in === 'path');
	const queryParams = operation.parameters.filter((p) => p.in === 'query');
	const headerParams = operation.parameters.filter((p) => p.in === 'header');

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

	const headers = buildHeaders(
		headerParams,
		params,
		operation.requestBody?.contentType,
	);

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
	if (body !== undefined && operation.requestBody !== undefined) {
		out.body = JSON.stringify(body);
	}
	return out;
};

/** Internal helper for the test suite. */
export const _internal = { substitutePath, buildQuery, buildHeaders };
