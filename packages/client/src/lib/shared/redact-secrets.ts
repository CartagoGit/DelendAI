const REDACTED = '[REDACTED]';

interface IRule {
	readonly re: RegExp;
	readonly replace?: (match: string, ...groups: string[]) => string;
}

const RULES: readonly IRule[] = [
	{
		re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
	},
	{ re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
	{ re: /\bAKIA[0-9A-Z]{16}\b/g },
	{ re: /\bgh[posru]_[A-Za-z0-9]{36,}\b/g },
	{ re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
	{ re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{ re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
	{ re: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
	{ re: /\bsk-ant-[A-Za-z0-9-]{16,}/g },
	{ re: /\bsk-or-[A-Za-z0-9-]{16,}/g },
	{ re: /\bsk-[A-Za-z0-9]{20,}\b/g },
	{
		re: /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
		replace: () => `Bearer ${REDACTED}`,
	},
	{
		re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)\b(\s*[:=]\s*)["']?([A-Za-z0-9._\-/+]{8,})["']?/gi,
		replace: (_match, key: string, sep: string) =>
			`${key}${sep}${REDACTED}`,
	},
	{
		re: /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD))(\s*[:=]\s*)["']?([A-Za-z0-9._\-/+]{8,})["']?/g,
		replace: (_match, name: string, sep: string) =>
			`${name}${sep}${REDACTED}`,
	},
];

export interface IRedactResult {
	readonly text: string;
	readonly redactions: number;
}

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
