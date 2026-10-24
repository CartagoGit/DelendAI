/**
 * secret-rules.constant.ts — the scanner's rules: the high-confidence
 * half of the one secret rule set in `@delendai/contracts`, whose match
 * is a credential rather than a guess. The scanner kept seven rules of
 * its own while the redactor knew eighteen.
 */
import { SECRET_RULES as SHARED_RULES } from '@delendai/contracts';

import type { ISecretRule } from '../interfaces/secrets.interface';

/** Key material and cloud root keys are critical; a webhook URL is medium. */
const SEVERITY: Readonly<Record<string, ISecretRule['severity']>> = {
	'private-key': 'critical',
	'aws-access-key': 'critical',
	'slack-webhook': 'medium',
	'url-credentials': 'medium',
};

/** The scanner's ids are stable: baselines and findings name them. */
const SCANNER_ID: Readonly<Record<string, string>> = {
	'aws-access-key': 'aws-access-key-id',
};

export const SECRET_RULES: readonly ISecretRule[] = SHARED_RULES.filter(
	(rule) => rule.highConfidence === true,
).map((rule) => ({
	id: SCANNER_ID[rule.name] ?? rule.name,
	description: `${rule.name.replaceAll('-', ' ')} shaped secret`,
	severity: SEVERITY[rule.name] ?? 'high',
	pattern: rule.re,
}));
