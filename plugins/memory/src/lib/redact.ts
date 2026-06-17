/**
 * Secret redaction for memory notes (M11).
 *
 * Memory is durable and re-surfaced across sessions, so an agent must never
 * persist a credential it happened to see. `redactSecrets` scrubs values that
 * match HIGH-CONFIDENCE secret shapes (well-known token prefixes, PEM private
 * keys, JWTs, and `key = value` assignments for secret-ish names) before a
 * note is written. The patterns favour precision over recall: better to miss
 * an exotic secret than to mangle a legitimate note.
 */

const REDACTED = '[REDACTED]';

interface IRule {
	readonly name: string;
	readonly re: RegExp;
	/** Replacement; defaults to the whole match → `[REDACTED]`. */
	readonly replace?: (match: string, ...groups: string[]) => string;
}

const RULES: readonly IRule[] = [
	// PEM private key blocks (RSA/EC/OPENSSH/PGP…).
	{
		name: 'private-key',
		re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
	},
	// JSON Web Tokens (three base64url segments).
	{ name: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
	// AWS access key id.
	{ name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
	// GitHub tokens (classic + fine-grained).
	{ name: 'github-token', re: /\bgh[posru]_[A-Za-z0-9]{36,}\b/g },
	{ name: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
	// Google API key.
	{ name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	// Slack token.
	{ name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
	// Stripe secret key.
	{ name: 'stripe-key', re: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
	// OpenAI-style secret key.
	{ name: 'openai-key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
	// `Authorization: Bearer <token>` headers.
	{
		name: 'bearer',
		re: /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
		replace: () => `Bearer ${REDACTED}`,
	},
	// Generic `secret-ish-name = value` / `: value` assignments. Only the
	// value is scrubbed, the key is kept so the note still reads sensibly.
	{
		name: 'assignment',
		re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)\b(\s*[:=]\s*)["']?([A-Za-z0-9._\-/+]{8,})["']?/gi,
		replace: (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`,
	},
];

export interface IRedactResult {
	/** The input with every detected secret replaced by `[REDACTED]`. */
	readonly text: string;
	/** Number of secrets redacted. */
	readonly redactions: number;
}

/** Redact high-confidence secrets from `input`. Pure; never throws. */
export const redactSecrets = (input: string): IRedactResult => {
	let text = input;
	let redactions = 0;
	for (const rule of RULES) {
		text = text.replace(rule.re, (...args) => {
			redactions += 1;
			const match = args[0] as string;
			const groups = args.slice(1, -2) as string[];
			return rule.replace ? rule.replace(match, ...groups) : REDACTED;
		});
	}
	return { text, redactions };
};
