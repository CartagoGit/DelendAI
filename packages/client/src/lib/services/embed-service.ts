/**
 * `EmbedService` — small, dependency-free helper that resolves and
 * validates the docs URL the IDE dashboard will embed in its Docs tab.
 *
 * Defaults to `https://mcp-vertex.dev`. Override via
 * `mcp-vertex.config.json#extension.docsUrl`.
 *
 * Safety rules:
 *   - HTTPS is required.
 *   - `localhost` and `127.0.0.1` are blocked by default (turn on
 *     `allowLocalhost` for local dev).
 *   - Private / link-local IPs are blocked.
 *   - `file:`, `data:`, `javascript:` and other non-http schemes are
 *     blocked.
 */
export const DEFAULT_DOCS_URL = 'https://mcp-vertex.dev';

export interface IEmbedServiceOptions {
	readonly allowLocalhost?: boolean;
	readonly allowPrivateIps?: boolean;
}

export interface IDocsUrlConfig {
	readonly extension?: { readonly docsUrl?: string };
}

export interface IResolvedDocsUrl {
	readonly url: string;
	readonly origin: string;
	readonly host: string;
}

export interface IDocsUrlValidation {
	readonly ok: boolean;
	readonly reason?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const LOOPBACK_HOSTS_BRACKETLESS = new Set([
	'localhost',
	'127.0.0.1',
	'::1',
	'0.0.0.0',
]);

const isPrivateIpv4 = (host: string): boolean => {
	const parts = host.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
	const [a, b] = parts as [number, number, number, number];
	if (a === 10) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true; // link-local
	return false;
};

export const resolveDocsUrl = (
	config: IDocsUrlConfig,
	defaultUrl: string = DEFAULT_DOCS_URL,
): string => {
	const candidate = config.extension?.docsUrl;
	if (typeof candidate === 'string' && candidate.length > 0) return candidate;
	return defaultUrl;
};

export const validateDocsUrl = (
	url: string,
	options: IEmbedServiceOptions = {},
): IDocsUrlValidation => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: 'invalid-url' };
	}
	if (parsed.protocol !== 'https:') {
		return { ok: false, reason: 'https-required' };
	}
	if (
		!options.allowLocalhost &&
		(LOOPBACK_HOSTS.has(parsed.hostname) ||
			LOOPBACK_HOSTS_BRACKETLESS.has(
				parsed.hostname.replace(/^\[|\]$/g, ''),
			))
	) {
		return { ok: false, reason: 'localhost-blocked' };
	}
	if (!options.allowPrivateIps && isPrivateIpv4(parsed.hostname)) {
		return { ok: false, reason: 'private-ip-blocked' };
	}
	return { ok: true };
};

export class EmbedService {
	constructor(private readonly options: IEmbedServiceOptions = {}) {}

	resolve(config: IDocsUrlConfig): IResolvedDocsUrl {
		const url = resolveDocsUrl(config);
		const validation = validateDocsUrl(url, this.options);
		if (!validation.ok) {
			throw new Error(
				`docs-url-rejected:${validation.reason ?? 'unknown'}`,
			);
		}
		const parsed = new URL(url);
		return {
			url,
			origin: parsed.origin,
			host: parsed.host,
		};
	}

	validate(url: string): IDocsUrlValidation {
		return validateDocsUrl(url, this.options);
	}
}
