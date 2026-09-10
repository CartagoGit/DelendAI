/**
 * High-confidence secret redaction (M11/M23).
 *
 * Any store that is durable and re-surfaced (memory notes, proposal documents)
 * must never persist a credential an agent happened to see. `redactSecrets`
 * scrubs values that match HIGH-CONFIDENCE secret shapes (well-known token
 * prefixes, PEM private keys, JWTs, `key = value` assignments for secret-ish
 * names, and `UPPER_ENV_STYLE_API_KEY = value` env-var assignments) before
 * content is written. The patterns favour precision over recall: better to miss
 * an exotic secret than to mangle a legitimate note.
 *
 * Lives in core so every persistent plugin shares one redactor (memory,
 * proposals, …) instead of each rolling its own.
 */

import {
	HIGH_CONFIDENCE_SECRET_PATTERNS,
	REDACTED,
	SECRET_RULES,
} from '../contracts/constants/secret-patterns.constant';

export {
	HIGH_CONFIDENCE_SECRET_PATTERNS,
	REDACTED,
} from '../contracts/constants/secret-patterns.constant';

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
