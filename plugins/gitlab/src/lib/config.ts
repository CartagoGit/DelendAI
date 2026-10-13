import { isIP } from 'node:net';

import type { IRemoteProjectCoordinates } from '@delendai/contracts/remote-provider';

export const DEFAULT_GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4';
export const DEFAULT_GITLAB_WEB_BASE_URL = 'https://gitlab.com';
export const GITLAB_TOKEN_ENV_KEYS = [
	'GITLAB_TOKEN',
	'GITLAB_PRIVATE_TOKEN',
] as const;

const BASE_TIMEOUT_MS = 15_000;
const BASE_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;

type ConfigSource = 'plugin' | 'env' | 'default';

export interface IGitLabProjectInput {
	readonly projectId?: string | number;
	readonly projectPath?: string;
	readonly displayName?: string;
	readonly webUrl?: string;
	readonly apiUrl?: string;
}

type MutableGitLabProjectInput = {
	-readonly [Key in keyof IGitLabProjectInput]?: IGitLabProjectInput[Key];
};

export interface IGitLabPluginOptions {
	readonly baseUrl?: string;
	readonly webUrl?: string;
	readonly defaultProject?: IGitLabProjectInput;
	readonly allowWrite?: boolean;
	readonly timeoutMs?: number;
	readonly maxRetries?: number;
	readonly retryBaseDelayMs?: number;
}

export interface IGitLabConfigInput {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly options?: IGitLabPluginOptions;
}

export interface IGitLabProviderContext {
	readonly provider: 'gitlab';
	readonly token: string;
	readonly apiBaseUrl: string;
	readonly webBaseUrl: string;
	readonly host: string;
	readonly project: IRemoteProjectCoordinates | null;
	readonly timeoutMs: number;
	readonly maxRetries: number;
	readonly retryBaseDelayMs: number;
	readonly sources: {
		readonly token: string;
		readonly apiBaseUrl: ConfigSource;
		readonly webBaseUrl: ConfigSource;
		readonly project: readonly ConfigSource[];
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

const assertSafeGitLabUrl = (input: string, label: string): string => {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`gitlab provider rejected ${label}: invalid URL`);
	}
	if (url.protocol !== 'https:') {
		throw new Error(`gitlab provider rejected ${label}: https is required`);
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
			`gitlab provider rejected ${label}: private and raw IP hosts are not allowed`,
		);
	}
	return url.toString().replace(/\/$/, '');
};

const deriveWebBaseUrl = (apiBaseUrl: string): string => {
	const url = new URL(apiBaseUrl);
	url.pathname = '/';
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
};

const resolveToken = (
	env: Readonly<Record<string, string | undefined>>,
): { readonly token: string; readonly source: string } => {
	for (const key of GITLAB_TOKEN_ENV_KEYS) {
		const value = env[key];
		if (isPresent(value)) {
			return { token: value, source: `env:${key}` };
		}
	}
	throw new Error(
		`gitlab provider missing token in ${GITLAB_TOKEN_ENV_KEYS.join(' or ')}. Tokens must come from the environment and are never persisted in config.`,
	);
};

const resolveProject = (
	input: IGitLabConfigInput,
	apiBaseUrl: string,
): {
	readonly project: IRemoteProjectCoordinates | null;
	readonly source: readonly ConfigSource[];
} => {
	const envProject: IGitLabProjectInput | undefined = (() => {
		const projectId =
			input.env.GITLAB_PROJECT_ID !== undefined &&
			input.env.GITLAB_PROJECT_ID.trim() !== ''
				? input.env.GITLAB_PROJECT_ID.trim()
				: undefined;
		const projectPath =
			input.env.GITLAB_PROJECT_PATH !== undefined &&
			input.env.GITLAB_PROJECT_PATH.trim() !== ''
				? input.env.GITLAB_PROJECT_PATH.trim()
				: undefined;
		if (projectId === undefined && projectPath === undefined)
			return undefined;
		return {
			...(projectId !== undefined ? { projectId } : {}),
			...(projectPath !== undefined ? { projectPath } : {}),
		};
	})();
	const layers: readonly [ConfigSource, IGitLabProjectInput | undefined][] = [
		['default', undefined],
		['env', envProject],
		['plugin', input.options?.defaultProject],
	];
	const merged: MutableGitLabProjectInput = {};
	const sources: ConfigSource[] = [];
	for (const [source, value] of layers) {
		if (value === undefined) continue;
		if (value.projectId !== undefined) merged.projectId = value.projectId;
		if (value.projectPath !== undefined)
			merged.projectPath = value.projectPath;
		if (value.displayName !== undefined)
			merged.displayName = value.displayName;
		if (value.webUrl !== undefined) merged.webUrl = value.webUrl;
		if (value.apiUrl !== undefined) merged.apiUrl = value.apiUrl;
		sources.push(source);
	}
	if (Object.keys(merged).length === 0) {
		return { project: null, source: sources };
	}
	const webBaseUrl = deriveWebBaseUrl(apiBaseUrl);
	const project: IRemoteProjectCoordinates = {
		provider: 'gitlab',
		host: new URL(apiBaseUrl).hostname,
		...(merged.projectId !== undefined
			? { projectId: String(merged.projectId) }
			: {}),
		...(merged.projectPath !== undefined
			? { projectPath: merged.projectPath }
			: {}),
		...(merged.displayName !== undefined
			? { displayName: merged.displayName }
			: {}),
		webUrl: merged.webUrl ?? webBaseUrl,
		apiUrl: merged.apiUrl ?? apiBaseUrl,
	};
	return {
		project,
		source: sources,
	};
};

export const resolveGitLabProviderContext = (
	input: IGitLabConfigInput,
): IGitLabProviderContext => {
	const token = resolveToken(input.env);
	const apiBaseUrl = pickLayeredValue([
		['plugin', input.options?.baseUrl],
		['env', input.env.GITLAB_URL],
		['default', DEFAULT_GITLAB_API_BASE_URL],
	]);
	const normalizedApiBaseUrl = assertSafeGitLabUrl(
		apiBaseUrl.value,
		'GITLAB_URL',
	);
	const webBaseUrl = pickLayeredValue([
		['plugin', input.options?.webUrl],
		['default', deriveWebBaseUrl(normalizedApiBaseUrl)],
	]);
	const normalizedWebBaseUrl = assertSafeGitLabUrl(
		webBaseUrl.value,
		'web base URL',
	);
	const timeoutMs = input.options?.timeoutMs ?? BASE_TIMEOUT_MS;
	const maxRetries = input.options?.maxRetries ?? BASE_MAX_RETRIES;
	const retryBaseDelayMs =
		input.options?.retryBaseDelayMs ?? BASE_RETRY_DELAY_MS;
	const project = resolveProject(input, normalizedApiBaseUrl);

	return {
		provider: 'gitlab',
		token: token.token,
		apiBaseUrl: normalizedApiBaseUrl,
		webBaseUrl: normalizedWebBaseUrl,
		host: new URL(normalizedApiBaseUrl).hostname,
		project: project.project,
		timeoutMs,
		maxRetries,
		retryBaseDelayMs,
		sources: {
			token: token.source,
			apiBaseUrl: apiBaseUrl.source,
			webBaseUrl: webBaseUrl.source,
			project: project.source,
		},
	};
};
