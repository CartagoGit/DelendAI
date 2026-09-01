/**
 * Secret redaction for remote-provider outputs.
 *
 * Replaces known sensitive values with [REDACTED] before any string leaves
 * the plugin boundary (errors, logs, tool outputs, snapshots).  The token
 * itself is never stored; only a hash-free sentinel is emitted.
 */

const REDACTED = '[REDACTED]';

/** Characters that need to be escaped when used in a RegExp literal. */
const RE_SPECIAL = /[$()*+.?[\\\]^{|}]/g;

const escapeForRegex = (value: string): string =>
	value.replace(RE_SPECIAL, '\\$&');

/**
 * Build a replacer that substitutes every occurrence of each secret with
 * [REDACTED].  Matching is case-sensitive and applies to exact substrings
 * so partial collisions (e.g. bearer vs base64 token) are handled correctly.
 */
export const buildRedactor = (
	secrets: readonly string[],
): ((input: string) => string) => {
	const candidates = secrets.filter((s) => s.trim().length > 0);
	if (candidates.length === 0) return (s) => s;
	const pattern = new RegExp(candidates.map(escapeForRegex).join('|'), 'g');
	return (input: string) => input.replace(pattern, REDACTED);
};

/** Names of environment variables that should never appear in outputs. */
const SENSITIVE_ENV_KEY_RE =
	/token|secret|password|passwd|api[-_]?key|auth|credential|private/i;

/**
 * Redact values for keys that look like secrets in an env-style record.
 * Returns a new object; original is not mutated.
 */
export const redactEnv = (
	env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> => {
	const result: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(env)) {
		result[key] = SENSITIVE_ENV_KEY_RE.test(key) ? REDACTED : value;
	}
	return result;
};

/**
 * Redact values for a set of explicit header names that carry auth material.
 * Names are compared case-insensitively.
 */
const SENSITIVE_HEADER_NAMES = new Set([
	'authorization',
	'x-auth-token',
	'private-token',
	'job-token',
	'deploy-token',
	'x-job-token',
]);

export const redactHeaders = (
	headers: Readonly<Record<string, string>>,
): Record<string, string> => {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		result[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase())
			? REDACTED
			: value;
	}
	return result;
};

/**
 * Apply a redactor to an arbitrary string-valued object (e.g. error details).
 * Non-string fields are left as-is.
 */
export const redactRecord = <T extends Record<string, unknown>>(
	obj: T,
	redact: (s: string) => string,
): T => {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		result[key] = typeof value === 'string' ? redact(value) : value;
	}
	return result as T;
};
