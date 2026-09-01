import type { RemoteProviderId } from '@mcp-vertex/contracts/remote-provider';
import z from 'zod';

const BASE_TIMEOUT_MS = 15_000;
const BASE_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

type ConfigSource = 'override' | 'plugin' | 'env' | 'default';

const BaseConfigSchema = z
	.object({
		baseUrl: z.string().url(),
		timeoutMs: z.number().int().min(1).max(120_000),
		maxRetries: z.number().int().min(0).max(5),
		retryBaseDelayMs: z.number().int().min(0).max(60_000),
	})
	.strict();

export interface IRemoteProviderConfigOverrides<
	TProject extends Record<string, unknown> = Record<string, never>,
> {
	readonly baseUrl?: string;
	readonly timeoutMs?: number;
	readonly maxRetries?: number;
	readonly retryBaseDelayMs?: number;
	readonly project?: Partial<TProject>;
}

export interface IRemoteProviderConfigInput<
	TProject extends Record<string, unknown> = Record<string, never>,
> {
	readonly provider: RemoteProviderId;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly tokenEnvKeys: readonly [string, ...string[]];
	readonly defaultBaseUrl: string;
	readonly baseUrlEnvKey?: string;
	readonly defaults?: IRemoteProviderConfigOverrides<TProject>;
	readonly envProject?: Partial<TProject>;
	readonly pluginOptions?: IRemoteProviderConfigOverrides<TProject>;
	readonly requestOverrides?: IRemoteProviderConfigOverrides<TProject>;
	readonly projectSchema?: z.ZodType<TProject>;
}

export interface IResolvedRemoteProviderSources {
	readonly token: string;
	readonly baseUrl: ConfigSource;
	readonly timeoutMs: ConfigSource;
	readonly maxRetries: ConfigSource;
	readonly retryBaseDelayMs: ConfigSource;
	readonly project: readonly ConfigSource[];
}

export interface IResolvedRemoteProviderConfig<
	TProject extends Record<string, unknown> = Record<string, never>,
> {
	readonly provider: RemoteProviderId;
	readonly token: string;
	readonly baseUrl: string;
	readonly timeoutMs: number;
	readonly maxRetries: number;
	readonly retryBaseDelayMs: number;
	readonly project: TProject | null;
	readonly sources: IResolvedRemoteProviderSources;
}

const hasOwnKeys = (value: object): boolean => Object.keys(value).length > 0;

const isPresent = <T>(value: T | undefined): value is T => value !== undefined;

const pickLayeredValue = <T>(
	layers: readonly [ConfigSource, T | undefined][],
): { readonly source: ConfigSource; readonly value: T } => {
	for (const [source, value] of layers) {
		if (isPresent(value)) return { source, value };
	}
	throw new Error('expected at least one present config value');
};

const mergeProjectLayers = <TProject extends Record<string, unknown>>(
	input: IRemoteProviderConfigInput<TProject>,
): {
	readonly project: TProject | null;
	readonly sources: readonly ConfigSource[];
} => {
	const layers: readonly [ConfigSource, Partial<TProject> | undefined][] = [
		['default', input.defaults?.project],
		['env', input.envProject],
		['plugin', input.pluginOptions?.project],
		['override', input.requestOverrides?.project],
	];
	const merged: Record<string, unknown> = {};
	const sources: ConfigSource[] = [];
	for (const [source, value] of layers) {
		if (value === undefined) continue;
		Object.assign(merged, value);
		sources.push(source);
	}
	if (!hasOwnKeys(merged)) return { project: null, sources };
	if (input.projectSchema === undefined) {
		return { project: merged as TProject, sources };
	}
	const parsed = input.projectSchema.safeParse(merged);
	if (!parsed.success) {
		throw new Error(
			`${input.provider} provider rejected project config: ${parsed.error.message}`,
		);
	}
	return { project: parsed.data, sources };
};

const resolveToken = (
	provider: RemoteProviderId,
	env: Readonly<Record<string, string | undefined>>,
	keys: readonly [string, ...string[]],
): { readonly token: string; readonly source: string } => {
	for (const key of keys) {
		const value = env[key];
		if (typeof value === 'string' && value.trim() !== '') {
			return { token: value, source: `env:${key}` };
		}
	}
	throw new Error(
		`${provider} provider missing token in ${keys.join(' or ')}. Tokens must come from the environment and are never persisted in config.`,
	);
};

export const resolveRemoteProviderConfig = <
	TProject extends Record<string, unknown> = Record<string, never>,
>(
	input: IRemoteProviderConfigInput<TProject>,
): IResolvedRemoteProviderConfig<TProject> => {
	const token = resolveToken(input.provider, input.env, input.tokenEnvKeys);
	const baseUrl = pickLayeredValue([
		['override', input.requestOverrides?.baseUrl],
		['plugin', input.pluginOptions?.baseUrl],
		[
			'env',
			input.baseUrlEnvKey !== undefined
				? input.env[input.baseUrlEnvKey]
				: undefined,
		],
		['default', input.defaults?.baseUrl ?? input.defaultBaseUrl],
	]);
	const timeoutMs = pickLayeredValue([
		['override', input.requestOverrides?.timeoutMs],
		['plugin', input.pluginOptions?.timeoutMs],
		['default', input.defaults?.timeoutMs ?? BASE_TIMEOUT_MS],
	]);
	const maxRetries = pickLayeredValue([
		['override', input.requestOverrides?.maxRetries],
		['plugin', input.pluginOptions?.maxRetries],
		['default', input.defaults?.maxRetries ?? BASE_MAX_RETRIES],
	]);
	const retryBaseDelayMs = pickLayeredValue([
		['override', input.requestOverrides?.retryBaseDelayMs],
		['plugin', input.pluginOptions?.retryBaseDelayMs],
		['default', input.defaults?.retryBaseDelayMs ?? BASE_RETRY_DELAY_MS],
	]);

	const parsedBase = BaseConfigSchema.safeParse({
		baseUrl: baseUrl.value,
		timeoutMs: timeoutMs.value,
		maxRetries: maxRetries.value,
		retryBaseDelayMs: retryBaseDelayMs.value,
	});
	if (!parsedBase.success) {
		throw new Error(
			`${input.provider} provider rejected config: ${parsedBase.error.message}`,
		);
	}

	const project = mergeProjectLayers(input);

	return {
		provider: input.provider,
		token: token.token,
		baseUrl: parsedBase.data.baseUrl,
		timeoutMs: parsedBase.data.timeoutMs,
		maxRetries: parsedBase.data.maxRetries,
		retryBaseDelayMs: parsedBase.data.retryBaseDelayMs,
		project: project.project,
		sources: {
			token: token.source,
			baseUrl: baseUrl.source,
			timeoutMs: timeoutMs.source,
			maxRetries: maxRetries.source,
			retryBaseDelayMs: retryBaseDelayMs.source,
			project: project.sources,
		},
	};
};
