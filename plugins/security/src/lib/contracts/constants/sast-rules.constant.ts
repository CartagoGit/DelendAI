import type { ISastRule } from '../interfaces/sast.interface';

export const SAST_RULES: readonly ISastRule[] = [
	{
		id: 'sql-injection',
		severity: 'critical',
		language: 'typescript',
		pattern: String.raw`\b(?:query|execute|raw)\s*\(\s*(?:\`[^\`]*\$\{[^}]+\}[^\`]*\`|['"][^'"]*(?:\+|\$\{)[^'"]*['"])`,
		message:
			'Potential SQL injection: avoid building SQL strings from untrusted input.',
	},
	{
		id: 'hardcoded-secret',
		severity: 'high',
		language: 'generic',
		pattern: String.raw`\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{12,}['"]`,
		message:
			'Potential hardcoded secret: move credentials to environment or secret storage.',
	},
	{
		id: 'unsafe-deserialize',
		severity: 'high',
		language: 'python',
		pattern: String.raw`\b(?:yaml\.load|pickle\.loads|marshal\.loads)\s*\(`,
		message:
			'Potential unsafe deserialization: prefer safe loaders for untrusted data.',
	},
	{
		id: 'dangerous-eval',
		severity: 'medium',
		language: 'javascript',
		pattern: String.raw`\b(?:eval\s*\(|new\s+Function\s*\()`,
		message:
			'Potential code execution sink: avoid eval/new Function on dynamic input.',
	},
] as const;
