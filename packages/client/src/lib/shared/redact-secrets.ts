/**
 * redact-secrets.ts — the client's redactor over the one secret rule set
 * in `@delendai/contracts`: it kept a list of its own that knew fewer key
 * shapes than core's.
 */
import { REDACTED, SECRET_RULES } from '@delendai/contracts';

export interface IRedactResult {
	readonly text: string;
	readonly redactions: number;
}

export const redactSecrets = (input: string): IRedactResult => {
	let text = input;
	let redactions = 0;
	for (const rule of SECRET_RULES) {
		text = text.replace(rule.re, (...args) => {
			redactions += 1;
			const match = args[0] as string;
			const groups = args.slice(1, -2) as string[];
			return rule.replace ? rule.replace(match, ...groups) : REDACTED;
		});
	}
	return { text, redactions };
};
