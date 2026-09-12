/**
 * secret-patterns.constant.ts — the one description of what a secret
 * looks like in this codebase.
 *
 * Split out of `shared/redact.ts` so the table lives where the repo's
 * convention puts exported constants, and — more importantly — so the
 * two readers of it are visibly reading the SAME list: the redactor that
 * scrubs durable stores, and the `lint:no-secrets` commit/push gate.
 *
 * That gate exists because a fake `sk_live_...` fixture reached GitHub's
 * push protection on 2026-09-03: the repository's own knowledge of what
 * a credential looks like lived only inside the redactor, and nothing
 * consulted it before writing a commit.
 *
 * The patterns favour precision over recall. Missing an exotic secret is
 * better than mangling a legitimate note — and, for the gate, far better
 * than blocking a commit over the word "token" in a fixture.
 */

/**
 * The stand-in written wherever a secret-shaped run of characters was.
 *
 * Exported so `forge-governance` uses THIS marker instead of declaring
 * its own — it had `'***'`, which is a second answer to "what does a
 * redaction look like" and made the two redactors distinguishable in
 * output for no reason.
 */
export const REDACTED = '[REDACTED]';

export interface ISecretRule {
	readonly name: string;
	readonly re: RegExp;
	/** Replacement; defaults to the whole match → `[REDACTED]`. */
	readonly replace?: (match: string, ...groups: string[]) => string;
	/**
	 * True when the pattern identifies a credential by its issuer's own
	 * prefix or structure (`sk_live_…`, `ghp_…`, a PEM block, a JWT) —
	 * i.e. a match is a credential, not a guess.
	 *
	 * The two heuristic rules at the end of the list match on a
	 * secret-ish NAME instead, which is right for redacting a log and
	 * wrong for blocking a commit: `token: "placeholder"` in a fixture
	 * is not a leak. `lint:no-secrets` gates on the high-confidence set
	 * only, so it can be blocking without ever crying wolf.
	 */
	readonly highConfidence?: boolean;
}

export const SECRET_RULES: readonly ISecretRule[] = [
	// PEM private key blocks (RSA/EC/OPENSSH/PGP…).
	{
		name: 'private-key',
		highConfidence: true,
		re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
	},
	// JSON Web Tokens (three base64url segments).
	{
		name: 'jwt',
		highConfidence: true,
		re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
	},
	// AWS access key id.
	{
		name: 'aws-access-key',
		highConfidence: true,
		re: /\bAKIA[0-9A-Z]{16}\b/g,
	},
	// GitHub tokens (classic + fine-grained).
	//
	// 16+, not 36+. A real `ghp_` token is 36 characters, but the
	// forge-governance redactor this list absorbed used 16 and it is the
	// safer bound: a truncated or test-shaped token still looks enough
	// like a credential to be worth hiding, and `ghp_` followed by
	// sixteen alphanumerics is not a phrase that occurs by accident.
	{
		name: 'github-token',
		highConfidence: true,
		re: /\bgh[posru]_[A-Za-z0-9]{16,}\b/g,
	},
	{
		name: 'github-pat',
		highConfidence: true,
		re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
	},
	// Google API key.
	{
		name: 'google-api-key',
		highConfidence: true,
		re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
	},
	// Slack token.
	{
		name: 'slack-token',
		highConfidence: true,
		re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
	},
	// Stripe secret key.
	{
		name: 'stripe-key',
		highConfidence: true,
		re: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g,
	},
	// Anthropic + OpenRouter keys — hyphenated bodies (`sk-ant-api03-…`,
	// `sk-or-v1-…`) the alnum-only `openai-key` rule below stops short of.
	// Listed first so the more specific prefix wins. (f00067 S8)
	{
		name: 'anthropic-key',
		highConfidence: true,
		re: /\bsk-ant-[A-Za-z0-9-]{16,}/g,
	},
	{
		name: 'openrouter-key',
		highConfidence: true,
		re: /\bsk-or-[A-Za-z0-9-]{16,}/g,
	},
	// OpenAI-style secret key.
	{
		name: 'openai-key',
		highConfidence: true,
		re: /\bsk-[A-Za-z0-9]{20,}\b/g,
	},
	// `Authorization: Bearer <token>` headers.
	{
		name: 'bearer',
		highConfidence: true,
		re: /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
		replace: () => `Bearer ${REDACTED}`,
	},
	// Generic `secret-ish-name = value` / `: value` assignments. Only the
	// value is scrubbed, the key is kept so the note still reads sensibly.
	// GitLab personal access tokens. Absorbed from the forge-governance
	// redactor, which was the only one that knew about them.
	{
		name: 'gitlab-pat',
		highConfidence: true,
		re: /\bglpat-[A-Za-z0-9_-]{16,}/g,
	},
	// Credentials embedded in a URL (`https://user:token@host/...`). The
	// password half is the secret; keep the scheme and host so the
	// message still says WHERE it was talking to.
	{
		name: 'url-credentials',
		highConfidence: true,
		re: /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g,
		replace: (_match, scheme: string) => `${scheme}${REDACTED}@`,
	},
	// Tokens passed as a query parameter. `assignment` below cannot see
	// these: its `\btoken\b` will not match inside `access_token`.
	{
		name: 'query-token',
		highConfidence: true,
		re: /([?&](?:access_token|private_token|token)=)[^\s&]+/g,
		replace: (_match, prefix: string) => `${prefix}${REDACTED}`,
	},
	// `Authorization: token <value>` — the other spelling of `Bearer`.
	{
		name: 'token-prefix',
		highConfidence: true,
		re: /\btoken\s+[A-Za-z0-9._~+/=-]{16,}/gi,
		replace: () => `token ${REDACTED}`,
	},
	{
		name: 'assignment',
		re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)\b(\s*[:=]\s*)["']?([A-Za-z0-9._\-/+]{8,})["']?/gi,
		replace: (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`,
	},
	// UPPER-CASE env-var assignments whose name ENDS in a secret-ish suffix
	// (`OPENAI_API_KEY=…`, `ANTHROPIC_API_KEY=…`, `AWS_SECRET_ACCESS_KEY=…`,
	// `DATABASE_PASSWORD=…`). The generic rule above misses these because the
	// `_` before `API_KEY`/`SECRET` denies the leading `\b`, so a prefixed
	// provider key in a config/log the agent read could otherwise persist
	// cleartext. The uppercase-name + suffix + assignment shape keeps the
	// false-positive risk low. (f00067 S8)
	{
		name: 'env-assignment',
		re: /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD))(\s*[:=]\s*)["']?([A-Za-z0-9._\-/+]{8,})["']?/g,
		replace: (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`,
	},
];

/**
 * The rules whose match IS a credential, exposed so a single definition
 * serves both redaction and the `lint:no-secrets` gate.
 */
export const HIGH_CONFIDENCE_SECRET_PATTERNS: readonly {
	readonly name: string;
	readonly re: RegExp;
}[] = SECRET_RULES.filter((rule) => rule.highConfidence === true).map(
	(rule) => ({ name: rule.name, re: rule.re }),
);
