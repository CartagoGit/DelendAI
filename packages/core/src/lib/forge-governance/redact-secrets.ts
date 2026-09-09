/**
 * redact-secrets.ts — a last line of defence so a credential can never
 * reach a governance result object.
 *
 * The broker itself never reads a token value: it takes whatever the
 * ambient environment already gives the `gh` CLI and lets the CLI do the
 * authenticating. But text coming BACK from a provider is not under our
 * control — a remote URL echoed in an error, a `Bearer …` header quoted
 * in a failure body — so every provider-originated string is scrubbed on
 * the way into a diff, a mutation result or an error message.
 *
 * Pattern-based on purpose: matching against the value of `GH_TOKEN`
 * would mean reading the secret into this process, which is exactly the
 * thing the credential rule forbids.
 */

/** Token shapes worth scrubbing on sight. Non-global; cloned per use. */
const SECRET_PATTERNS: readonly RegExp[] = [
	/gh[pousr]_[A-Za-z0-9]{16,}/u,
	/github_pat_[A-Za-z0-9_]{20,}/u,
	/glpat-[A-Za-z0-9_-]{16,}/u,
	/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
	/\btoken\s+[A-Za-z0-9._~+/=-]{8,}/iu,
	/(?:https?:\/\/)[^\s/@]+:[^\s/@]+@/u,
	/(?<=[?&](?:access_token|private_token|token)=)[^\s&]+/u,
];

/** The stand-in written wherever a secret-shaped run of characters was. */
export const REDACTED = '***';

/**
 * Replace every secret-shaped substring with `***`. Total and pure: safe
 * to call on any provider text before it is stored in a result object.
 */
export const redactSecrets = (text: string): string => {
	let scrubbed = text;
	for (const pattern of SECRET_PATTERNS) {
		const global = new RegExp(pattern.source, `${pattern.flags}g`);
		scrubbed = scrubbed.replace(global, REDACTED);
	}
	return scrubbed;
};

/**
 * Trim, cap and redact a provider message so it is fit to embed in a
 * result. Capping matters because an unbounded API body is both a leak
 * surface and a log-flooding surface.
 */
export const safeProviderMessage = (text: string, maxLength = 400): string => {
	const scrubbed = redactSecrets(text).trim();
	return scrubbed.length > maxLength
		? `${scrubbed.slice(0, maxLength)}…`
		: scrubbed;
};
