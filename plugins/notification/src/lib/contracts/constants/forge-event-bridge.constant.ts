/** Constants for the forge event bridge and its tools. */

/** The `event` field of a forge notification. */
export const FORGE_NOTICE_EVENT = 'forge-event';

/** How long `forge_await` waits by default, and at most. */
export const DEFAULT_FORGE_AWAIT_TIMEOUT_MS = 600_000;
export const MAX_FORGE_AWAIT_TIMEOUT_MS = 3_600_000;

/** Notices kept per agent until it asks; the oldest go first. */
export const MAX_QUEUED_FORGE_NOTICES = 100;

/** The most of a comment a notice repeats. */
export const MAX_NOTICE_COMMENT_CHARS = 500;

/** The prefix `land` writes its comments with: the reason of its verdict. */
export const LAND_COMMENT_PREFIX = 'land:';

/** Check conclusions that are not a failure. */
export const PASSING_CONCLUSIONS: readonly string[] = [
	'success',
	'neutral',
	'skipped',
];

/** Deliveries remembered per server, so a file is told once per agent. */
export const MAX_DELIVERED_KEYS = 10_000;

/** What `forge_await` answers where the project has not opted in. */
export const FORGE_EVENTS_OFF =
	'This project receives no forge events: set development.integration.forgeEvents to true to opt in.';
