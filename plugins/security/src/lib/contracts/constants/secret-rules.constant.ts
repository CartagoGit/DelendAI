/**
 * secret-rules.constant.ts — high-precision, format-specific secret rules.
 * Deliberately narrow (known key/token shapes) to keep false positives near
 * zero on a real codebase; add rules here as data, never new control flow.
 */
import type { ISecretRule } from '../interfaces/secrets.interface';

export const SECRET_RULES: readonly ISecretRule[] = [
	{
		id: 'private-key',
		description: 'Private key material',
		severity: 'critical',
		pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
	},
	{
		id: 'aws-access-key-id',
		description: 'AWS access key id',
		severity: 'critical',
		pattern: /\bAKIA[0-9A-Z]{16}\b/g,
	},
	{
		id: 'github-token',
		description: 'GitHub token',
		severity: 'high',
		pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g,
	},
	{
		id: 'openai-key',
		description: 'OpenAI API key',
		severity: 'high',
		pattern: /\bsk-[A-Za-z0-9]{32,}\b/g,
	},
	{
		id: 'slack-token',
		description: 'Slack token',
		severity: 'high',
		pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
	},
	{
		id: 'google-api-key',
		description: 'Google API key',
		severity: 'high',
		pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
	},
	{
		id: 'slack-webhook',
		description: 'Slack webhook url',
		severity: 'medium',
		pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g,
	},
];
