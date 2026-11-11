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
	'issue_comment',
] as const;

/** The sender type GitHub gives an automation. */
export const GITHUB_BOT_SENDER_TYPE = 'Bot';

/** The line `gh webhook forward` prints once its websocket is open. */
export const GH_FORWARD_READY_LINE = 'Forwarding Webhook events';

/** How long `gh webhook forward` may take to say it is ready. */
export const GH_FORWARD_READY_TIMEOUT_MS = 30_000;

/** The loopback address the local listener binds: never a public one. */
export const GH_FORWARD_LISTEN_HOST = '127.0.0.1';

/** The most of a failed forwarder's output a report line keeps. */
export const GH_FORWARD_REASON_CHARS = 300;

/** The tail of a forwarder's output kept to explain why it ended. */
export const GH_FORWARD_OUTPUT_KEEP_CHARS = 4_096;
