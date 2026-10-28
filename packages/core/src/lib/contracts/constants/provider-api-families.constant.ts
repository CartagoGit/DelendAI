/**
 * provider-api-families.constant.ts — the API families delendai speaks to
 * a provider directly, by the SDK package models.dev names for it.
 *
 * A family is a wire protocol, not a vendor: 193 of models.dev's providers
 * speak the OpenAI-compatible one. A family not listed here is reported as
 * unsupported, never guessed.
 */
import type { IProviderApiFamily } from '../interfaces/provider-api.interface';

/** Every family delendai speaks, the one list the type and the schemas read. */
export const PROVIDER_API_FAMILY_IDS = [
	'openai',
	'anthropic',
	'google',
] as const;

export const PROVIDER_API_FAMILIES: Readonly<
	Record<string, IProviderApiFamily>
> = {
	'@ai-sdk/openai-compatible': 'openai',
	'@ai-sdk/openai': 'openai',
	'@ai-sdk/anthropic': 'anthropic',
	// Google's Generative Language API, reached with an API key. Vertex
	// (`@ai-sdk/google-vertex`) signs in through Google Cloud instead and
	// is not one of these.
	'@ai-sdk/google': 'google',
};

/** Where a family's own API lives, for a provider the catalogue gives no URL. */
export const FAMILY_DEFAULT_BASE_URL: Readonly<
	Record<IProviderApiFamily, string>
> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google: 'https://generativelanguage.googleapis.com/v1beta',
};

export const ANTHROPIC_API_VERSION = '2023-06-01';

export const PROVIDER_CALL_TIMEOUT_MS = 120_000;

/** Tokens one prompt may answer with when the caller names no limit. */
export const DEFAULT_PROMPT_MAX_TOKENS = 1024;
