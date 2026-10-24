export type IEmbedProviderId = 'openai' | 'voyage' | 'cohere';

export interface IDiscoveredEmbedProvider {
	readonly id: IEmbedProviderId;
	readonly present: boolean;
}

const PROVIDER_ENV_VARS: Readonly<Record<IEmbedProviderId, string>> = {
	openai: 'OPENAI_API_KEY',
	voyage: 'VOYAGE_API_KEY',
	cohere: 'COHERE_API_KEY',
};

const hasNonEmptyValue = (value: string | undefined): boolean =>
	typeof value === 'string' && value.trim().length > 0;

export const discoverProviders = (
	env: Readonly<Record<string, string | undefined>> = process.env,
): readonly IDiscoveredEmbedProvider[] =>
	(
		Object.entries(PROVIDER_ENV_VARS) as Array<[IEmbedProviderId, string]>
	).map(([id, envVar]) => ({
		id,
		present: hasNonEmptyValue(env[envVar]),
	}));

export const resolveProviderApiKey = (
	providerId: IEmbedProviderId,
	env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined => {
	const envVar = PROVIDER_ENV_VARS[providerId];
	const value = env[envVar];
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};
