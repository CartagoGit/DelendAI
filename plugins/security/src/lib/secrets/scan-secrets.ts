/**
 * scan-secrets.ts — the pure secret scanner. Runs each rule over each file's
 * text and emits normalized `IFinding`s with a redacted match + line number.
 * No I/O; fully unit-testable.
 */
import type { IFinding } from '@delendai/core/public';

import { SECRET_RULES } from '../contracts/constants/secret-rules.constant';
import type {
	ISecretRule,
	ISecretScanFile,
} from '../contracts/interfaces/secrets.interface';

/** 1-indexed line number of `index` within `content`. */
const lineOf = (content: string, index: number): number => {
	let line = 1;
	const bound = Math.min(index, content.length);
	for (let i = 0; i < bound; i += 1) {
		if (content[i] === '\n') line += 1;
	}
	return line;
};

/** Show only the head + tail of a match so the finding never leaks the secret. */
const redact = (match: string): string =>
	match.length <= 8 ? '***' : `${match.slice(0, 4)}***${match.slice(-2)}`;

/** A fresh global regex from a rule (avoids shared `lastIndex` state). */
const globalRegex = (rule: ISecretRule): RegExp =>
	new RegExp(
		rule.pattern.source,
		rule.pattern.flags.includes('g')
			? rule.pattern.flags
			: `${rule.pattern.flags}g`,
	);

/**
 * Scan `files` with `rules` (defaults to the built-in high-precision set) →
 * normalized findings (severity, rule id, file:line, redacted match, fix).
 * Pure; deterministic; never throws.
 */
export const scanSecrets = (
	files: readonly ISecretScanFile[],
	rules: readonly ISecretRule[] = SECRET_RULES,
): IFinding[] => {
	const findings: IFinding[] = [];
	for (const file of files) {
		for (const rule of rules) {
			const regex = globalRegex(rule);
			let match: RegExpExecArray | null = regex.exec(file.content);
			while (match !== null) {
				findings.push({
					ruleId: rule.id,
					severity: rule.severity,
					message: `${rule.description} detected (${redact(match[0])})`,
					location: {
						file: file.path,
						line: lineOf(file.content, match.index),
					},
					fix: 'Remove the secret, rotate it, and load it from an environment variable instead.',
				});
				// Guard against a zero-width match looping forever.
				if (match.index === regex.lastIndex) regex.lastIndex += 1;
				match = regex.exec(file.content);
			}
		}
	}
	return findings;
};
