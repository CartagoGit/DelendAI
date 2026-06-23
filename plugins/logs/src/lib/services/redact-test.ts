import { redactSecrets } from '@mcp-vertex/core/public';

const PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> =
	[
		{ name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
		{ name: 'github-token', re: /\bgh[posru]_[A-Za-z0-9]{36,}\b/ },
		{ name: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
		{
			name: 'jwt',
			re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
		},
		{
			name: 'private-key',
			re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/,
		},
		{ name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
		{
			name: 'assignment',
			re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9._\-/+]{8,}["']?/i,
		},
	];

export const redactTest = (
	text: string,
): { detected: readonly string[]; redacted: string } => ({
	detected: PATTERNS.filter((pattern) => pattern.re.test(text)).map(
		(pattern) => pattern.name,
	),
	redacted: redactSecrets(text).text,
});
