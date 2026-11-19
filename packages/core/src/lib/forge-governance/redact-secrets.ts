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
 *
 * The patterns themselves live in `../shared/redact`. This module used
 * to carry its own seven, which meant two redactors in one package with
 * two different rule sets and two different markers — and each one's
 * tests only ever covered its own copy. The union is now in the shared
 * list: it gained this module's GitLab PATs, URL credentials, query
 * tokens and `token <value>` headers, and this module gained its private
 * keys, JWTs and every cloud-provider key it had never heard of.
 */

import { redactSecrets } from '../shared/redact';

export { REDACTED } from '../shared/redact';

/**
 * Trim, cap and redact a provider message so it is fit to embed in a
 * result. Capping matters because an unbounded API body is both a leak
 * surface and a log-flooding surface.
 */
export const safeProviderMessage = (text: string, maxLength = 400): string => {
	const scrubbed = redactSecrets(text).text.trim();
	return scrubbed.length > maxLength
		? `${scrubbed.slice(0, maxLength)}…`
		: scrubbed;
};
