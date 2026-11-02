/**
 * load-spec.interface.ts — how a spec URL is loaded, and what comes back.
 */
import type { IFetchLike, webFetch } from '@delendai/web-fetch/public';

import type { IOpenApiSpec } from '../../spec/openapi';

export interface ILoadSpecOptions {
	readonly url: string;
	readonly allowList: readonly string[];
	readonly maxBytes?: number;
	readonly timeoutMs?: number;
	/** The network seam under the engine (tests inject one). */
	readonly fetch?: IFetchLike;
	/** The engine itself; defaults to web-fetch's. */
	readonly engine?: typeof webFetch;
}

export type ILoadedSpec =
	| {
			readonly ok: true;
			readonly spec: IOpenApiSpec;
			readonly status: number;
	  }
	| { readonly ok: false; readonly reason: string };
