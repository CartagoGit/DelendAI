/**
 * provider-api.interface.ts — calling a provider's API directly, through
 * the family its catalogue entry names.
 */
import type { PROVIDER_API_FAMILY_IDS } from '../constants/provider-api-families.constant';

/** The wire protocols delendai speaks to a provider. */
export type IProviderApiFamily = (typeof PROVIDER_API_FAMILY_IDS)[number];

/** What is needed to call one provider: where, how, and which variable holds the key. */
export interface IProviderEndpoint {
	readonly providerId: string;
	readonly family: IProviderApiFamily;
	readonly baseUrl: string;
	/** The variable the key was found in; its value is read at call time only. */
	readonly keyVariable: string;
}

/** Why a provider cannot be called directly. */
export type IProviderUnreachable =
	| {
			readonly reason: 'unsupported-family';
			readonly npm?: string | undefined;
	  }
	| { readonly reason: 'no-key'; readonly variables: readonly string[] };

export interface IProviderAnswer {
	readonly text: string;
	readonly usage?:
		| { readonly inputTokens: number; readonly outputTokens: number }
		| undefined;
}

/** An HTTP call; injected so specs need no network. */
export type IProviderHttp = (
	url: string,
	init: {
		readonly method: 'GET' | 'POST';
		readonly headers: Readonly<Record<string, string>>;
		readonly body?: string | undefined;
		readonly timeoutMs: number;
	},
) => Promise<{ readonly status: number; readonly json: unknown }>;
