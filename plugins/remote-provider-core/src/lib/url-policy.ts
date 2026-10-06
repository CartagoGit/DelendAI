/**
 * URL validation and SSRF protection for remote-provider requests.
 *
 * Only HTTPS is allowed.  Private/loopback/link-local ranges and bare IP
 * addresses are rejected unless explicitly allow-listed.  Provider-specific
 * base URLs for GitLab self-managed and GitHub Enterprise are validated here.
 */

/** Blocked IP patterns that indicate SSRF targets. */
const LOOPBACK_RE = /^(127\.|::1$)/;
const PRIVATE_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const LINK_LOCAL_RE = /^(169\.254\.|fe80::)/i;
const METADATA_RE = /^169\.254\./;

/** Hostnames that must never resolve to a remote request. */
const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'0.0.0.0',
	'::1',
	'metadata.google.internal',
]);

const ALLOWED_SCHEMES = new Set(['https:']);

export class UrlPolicyError extends Error {
	constructor(
		message: string,
		public readonly url: string,
	) {
		super(message);
		this.name = 'UrlPolicyError';
	}
}

/** IP address detection (v4 only — v6 addresses with brackets also caught). */
const isRawIpAddress = (hostname: string): boolean =>
	/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[');

const isSsrfHost = (hostname: string): boolean => {
	if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;
	if (isRawIpAddress(hostname)) {
		if (
			LOOPBACK_RE.test(hostname) ||
			PRIVATE_RE.test(hostname) ||
			LINK_LOCAL_RE.test(hostname) ||
			METADATA_RE.test(hostname)
		) {
			return true;
		}
		// Reject all bare IPs unless caller explicitly allow-listed them.
		return true;
	}
	return false;
};

export interface IUrlPolicyOptions {
	/**
	 * Additional hostnames that are explicitly allowed even if they would
	 * otherwise be blocked (e.g. an on-prem GitLab with an RFC-1918 IP).
	 * Use with caution; each entry should be validated by the operator.
	 */
	readonly allowedHosts?: readonly string[];
}

/**
 * Assert that a URL string is safe to use as a remote-provider base URL.
 *
 * - Must be parseable as a URL.
 * - Must use `https:` scheme.
 * - Must not target loopback, private, link-local, or metadata IP ranges.
 * - Must not be a raw IP address unless explicitly allow-listed.
 *
 * Throws `UrlPolicyError` on any violation.
 */
export const assertSafeBaseUrl = (
	raw: string,
	options: IUrlPolicyOptions = {},
): void => {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new UrlPolicyError(`Invalid URL: cannot be parsed`, raw);
	}

	if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
		throw new UrlPolicyError(
			`Insecure scheme "${parsed.protocol}": only https is allowed`,
			raw,
		);
	}

	const hostname = parsed.hostname;
	const allowedHosts = options.allowedHosts ?? [];

	if (isSsrfHost(hostname) && !allowedHosts.includes(hostname)) {
		throw new UrlPolicyError(
			`Blocked host "${hostname}": SSRF protection rejects private/loopback/IP addresses`,
			raw,
		);
	}
};

/**
 * Validate a provider-specific base URL (GitHub Enterprise or GitLab self-managed).
 * Returns the normalized URL string (trailing slash removed) or throws.
 */
export const validateProviderBaseUrl = (
	raw: string,
	_provider: 'github' | 'gitlab' | string,
	options: IUrlPolicyOptions = {},
): string => {
	assertSafeBaseUrl(raw, options);
	const parsed = new URL(raw);
	// Normalize: no trailing slash on origin
	return parsed.origin + (parsed.pathname.replace(/\/$/, '') || '');
};

/**
 * Default base URLs for supported providers.
 * These are constants, not config — they cannot be overridden to private ranges.
 */
export const PROVIDER_DEFAULT_BASE_URLS: Readonly<Record<string, string>> = {
	github: 'https://api.github.com',
	gitlab: 'https://gitlab.com',
};
