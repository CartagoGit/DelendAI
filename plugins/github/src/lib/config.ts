import { isIP } from 'node:net';

import type { IRemoteProjectCoordinates } from '@mcp-vertex/contracts/remote-provider';

export const DEFAULT_GITHUB_API_BASE_URL = 'https://api.github.com';
export const DEFAULT_GITHUB_WEB_BASE_URL = 'https://github.com';
export const GITHUB_TOKEN_ENV_KEYS = ['GITHUB_TOKEN'] as const;
export const GITHUB_REPOSITORY_ENV_KEYS = [
	'GITHUB_OWNER',
	'GITHUB_REPOSITORY',
] as const;

const BASE_TIMEOUT_MS = 15_000;
const BASE_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

type ConfigSource = 'plugin' | 'env' | 'default';

export interface IGitHubRepositoryInput {
	readonly owner?: string;
	readonly repository?: string;
	readonly displayName?: string;
	readonly webUrl?: string;
	readonly apiUrl?: string;
}

type MutableGitHubRepositoryInput = {
	-readonly [Key in keyof IGitHubRepositoryInput]?: IGitHubRepositoryInput[Key];
};

export interface IGitHubPluginOptions {
	readonly apiUrl?: string;
	readonly webUrl?: string;
	readonly defaultRepository?: IGitHubRepositoryInput;
	readonly timeoutMs?: number;
	readonly maxRetries?: number;
	readonly retryBaseDelayMs?: number;
	readonly allowWrite?: boolean;
}

export interface IGitHubConfigInput {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly options?: IGitHubPluginOptions;
}

export interface IGitHubProviderContext {
	readonly provider: 'github';
	readonly token: string;
	readonly apiBaseUrl: string;
	readonly webBaseUrl: string;
	readonly host: string;
	readonly repository: IRemoteProjectCoordinates | null;
	readonly timeoutMs: number;
	readonly maxRetries: number;
	readonly retryBaseDelayMs: number;
	readonly sources: {
		readonly token: string;
		readonly apiBaseUrl: ConfigSource;
		readonly webBaseUrl: ConfigSource;
		readonly repository: readonly ConfigSource[];
	};
}

const isPresent = (value: string | undefined): value is string =>
	typeof value === 'string' && value.trim() !== '';

const pickLayeredValue = <T>(
	layers: readonly [ConfigSource, T | undefined][],
): { readonly source: ConfigSource; readonly value: T } => {
	for (const [source, value] of layers) {
		if (value !== undefined) return { source, value };
	}
	throw new Error('expected at least one present config value');
};

const assertSafeGitHubUrl = (input: string, label: string): string => {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`github provider rejected ${label}: invalid URL`);
	}
	if (url.protocol !== 'https:') {
		throw new Error(`github provider rejected ${label}: https is required`);
	}
	const host = url.hostname;
	if (
		host === 'localhost' ||
		host === '::1' ||
		host.startsWith('127.') ||
		host.startsWith('10.') ||
		host.startsWith('192.168.') ||
		/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
		isIP(host) !== 0
	) {
		throw new Error(
			`github provider rejected ${label}: private and raw IP hosts are not allowed`,
		);
	}
	return url.toString().replace(/\/$/, '');
};

const deriveWebBaseUrl = (apiBaseUrl: string): string => {
	const url = new URL(apiBaseUrl);
	if (url.hostname === 'api.github.com') {
		return DEFAULT_GITHUB_WEB_BASE_URL;
	}
	if (url.pathname.startsWith('/api/v3')) {
		url.pathname = '/';
		url.search = '';
		url.hash = '';
		return url.toString().replace(/\/$/, '');
	}
	url.pathname = '/';
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
};

const resolveToken = (
	env: Readonly<Record<string, string | undefined>>,
): { readonly token: string; readonly source: string } => {
	for (const key of GITHUB_TOKEN_ENV_KEYS) {
		const value = env[key];
		if (isPresent(value)) {
			return { token: value, source: `env:${key}` };
		}
	}
	throw new Error(
		`github provider missing token in ${GITHUB_TOKEN_ENV_KEYS.join(' or ')}. Tokens must come from the environment and are never persisted in config.`,
	);
};

const resolveRepository = (
	input: IGitHubConfigInput,
	apiBaseUrl: string,
): {
	readonly repository: IRemoteProjectCoordinates | null;
	readonly source: readonly ConfigSource[];
} => {
	const envRepository: IGitHubRepositoryInput | undefined = (() => {
		const owner = isPresent(input.env.GITHUB_OWNER)
			? input.env.GITHUB_OWNER.trim()
			: undefined;
		const repository = isPresent(input.env.GITHUB_REPOSITORY)
			? input.env.GITHUB_REPOSITORY.trim()
			: undefined;
		if (owner === undefined && repository === undefined) return undefined;
		return {
			...(owner !== undefined ? { owner } : {}),
			...(repository !== undefined ? { repository } : {}),
		};
	})();
	const layers: readonly [
		ConfigSource,
		IGitHubRepositoryInput | undefined,
	][] = [
		['default', undefined],
		['env', envRepository],
		['plugin', input.options?.defaultRepository],
	];
	const merged: MutableGitHubRepositoryInput = {};
	const sources: ConfigSource[] = [];
	for (const [source, value] of layers) {
		if (value === undefined) continue;
		if (value.owner !== undefined) merged.owner = value.owner;
		if (value.repository !== undefined)
			merged.repository = value.repository;
		if (value.displayName !== undefined)
			merged.displayName = value.displayName;
		if (value.webUrl !== undefined) merged.webUrl = value.webUrl;
		if (value.apiUrl !== undefined) merged.apiUrl = value.apiUrl;
		sources.push(source);
	}
	if (Object.keys(merged).length === 0) {
		return { repository: null, source: sources };
	}
	const webBaseUrl = deriveWebBaseUrl(apiBaseUrl);
	const repository: IRemoteProjectCoordinates = {
		provider: 'github',
		host: new URL(webBaseUrl).hostname,
		...(merged.owner !== undefined ? { owner: merged.owner } : {}),
		...(merged.repository !== undefined
			? { repository: merged.repository }
			: {}),
		...(merged.displayName !== undefined
			? { displayName: merged.displayName }
			: {}),
		webUrl: merged.webUrl ?? webBaseUrl,
		apiUrl: merged.apiUrl ?? apiBaseUrl,
	};
	return {
		repository,
		source: sources,
	};
};

export const resolveGitHubProviderContext = (
	input: IGitHubConfigInput,
): IGitHubProviderContext => {
	const token = resolveToken(input.env);
	const apiBaseUrl = pickLayeredValue([
		['plugin', input.options?.apiUrl],
		['env', input.env.GITHUB_API_URL],
		['default', DEFAULT_GITHUB_API_BASE_URL],
	]);
	const normalizedApiBaseUrl = assertSafeGitHubUrl(
		apiBaseUrl.value,
		'GITHUB_API_URL',
	);
	const webBaseUrl = pickLayeredValue([
		['plugin', input.options?.webUrl],
		['default', deriveWebBaseUrl(normalizedApiBaseUrl)],
	]);
	const normalizedWebBaseUrl = assertSafeGitHubUrl(
		webBaseUrl.value,
		'web base URL',
	);
	const timeoutMs = input.options?.timeoutMs ?? BASE_TIMEOUT_MS;
	const maxRetries = input.options?.maxRetries ?? BASE_MAX_RETRIES;
	const retryBaseDelayMs =
		input.options?.retryBaseDelayMs ?? BASE_RETRY_DELAY_MS;
	const repository = resolveRepository(input, normalizedApiBaseUrl);

	return {
		provider: 'github',
		token: token.token,
		apiBaseUrl: normalizedApiBaseUrl,
		webBaseUrl: normalizedWebBaseUrl,
		host: new URL(normalizedWebBaseUrl).hostname,
		repository: repository.repository,
		timeoutMs,
		maxRetries,
		retryBaseDelayMs,
		sources: {
			token: token.source,
			apiBaseUrl: apiBaseUrl.source,
			webBaseUrl: webBaseUrl.source,
			repository: repository.source,
		},
	};
};
