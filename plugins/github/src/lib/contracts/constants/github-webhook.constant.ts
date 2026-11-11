/** Constants for GitHub webhook deliveries. */

/** The digest size of the signature delendai checks: SHA-256, never SHA-1. */
export const GITHUB_SIGNATURE_BITS = 256;

/** The headers GitHub names a delivery and signs it with, lower case. */
export const GITHUB_WEBHOOK_HEADERS = {
	event: 'x-github-event',
	signature: `x-hub-signature-${String(GITHUB_SIGNATURE_BITS)}`,
} as const;

/** The prefix of a SHA-256 signature header value. */
export const GITHUB_SIGNATURE_PREFIX = `sha${String(GITHUB_SIGNATURE_BITS)}=`;

/** The events delendai asks GitHub to deliver: the ones the adapter maps. */
export const GITHUB_FORWARDED_EVENTS = [
	'push',
	'pull_request',
	'check_run',
	'pull_request_review',
	'issues',
] as const;

/** The sender type GitHub gives an automation. */
export const GITHUB_BOT_SENDER_TYPE = 'Bot';
