import type { toolError } from '@delendai/core/public';
import type { IFetchLike, webFetch } from '@delendai/web-fetch/public';

import type { IOpenApiSpec } from '../../spec/openapi';

/** The spec-carrying arguments every api tool accepts. */
export interface IResolveSpecArgs {
	readonly spec?: unknown;
	readonly specUrl?: string | undefined;
	readonly allowList?: readonly string[] | undefined;
	readonly timeoutMs?: number | undefined;
	readonly maxBytes?: number | undefined;
}

/** What a host configures on a tool to load a spec. */
export interface IResolveSpecOptions {
	/** Pre-loaded spec; a `spec` or `specUrl` argument takes precedence. */
	readonly spec?: IOpenApiSpec;
	/** Default `allowList` when the tool has to fetch a spec URL itself. */
	readonly defaultAllowList?: readonly string[];
	/** Replaces the whole web-fetch engine; tests inject a stub. */
	readonly fetchImpl?: typeof webFetch;
	/** Replaces only the transport under the web-fetch engine. */
	readonly specFetch?: IFetchLike;
}

export type IResolvedSpec =
	| { readonly spec: IOpenApiSpec }
	| { readonly error: ReturnType<typeof toolError> };
