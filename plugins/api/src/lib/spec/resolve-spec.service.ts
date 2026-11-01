/**
 * The one way the api tools turn their arguments into a parsed spec.
 *
 * Each tool used to carry its own copy, and they had drifted: `api_mock`
 * could not load a `specUrl` in production at all, and `api_call` re-parsed
 * an already parsed spec into an empty one.
 */
import { toolError } from '@delendai/core/public';

import { fetchAndParseSpec, parseOpenApi } from './openapi';
import type { IOpenApiSpec } from './openapi';
import type {
	IResolvedSpec,
	IResolveSpecArgs,
	IResolveSpecOptions,
} from '../contracts/interfaces/resolve-spec.interface';

const isParsedSpec = (value: unknown): value is IOpenApiSpec =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	'operations' in value;

const loadSpecUrl = async (
	url: string,
	args: IResolveSpecArgs,
	options: IResolveSpecOptions,
): Promise<IResolvedSpec> => {
	const allowList = args.allowList ?? options.defaultAllowList;
	if (allowList === undefined || allowList.length === 0) {
		return {
			error: toolError(
				'specUrl requires an allowList.',
				'Pass `allowList: ["api.example.com"]` or supply `spec` inline.',
			),
		};
	}
	const loaded = await fetchAndParseSpec({
		url,
		allowList,
		...(options.specFetch === undefined
			? {}
			: { fetch: options.specFetch }),
		...(options.fetchImpl === undefined
			? {}
			: { engine: options.fetchImpl }),
		...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
		...(args.maxBytes === undefined ? {} : { maxBytes: args.maxBytes }),
	});
	if (!loaded.ok) {
		return {
			error: toolError(
				`specUrl fetch rejected: ${loaded.reason}`,
				'Check the `allowList` / `specUrl`, or pass `spec` inline.',
			),
		};
	}
	return { spec: loaded.spec };
};

/** Inline spec first, then `specUrl`, then the host's pre-loaded spec. */
export const resolveSpec = async (
	args: IResolveSpecArgs,
	options: IResolveSpecOptions,
): Promise<IResolvedSpec> => {
	if (args.spec !== undefined) {
		return {
			spec: isParsedSpec(args.spec)
				? args.spec
				: parseOpenApi(args.spec as object),
		};
	}
	if (args.specUrl !== undefined) {
		return loadSpecUrl(args.specUrl, args, options);
	}
	if (options.spec !== undefined) return { spec: options.spec };
	return {
		error: toolError(
			'missing-spec',
			'Pass `spec` (inline object) or `specUrl` (URL + allowList).',
		),
	};
};
