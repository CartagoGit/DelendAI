/** Constants for the shared forge event store under a workspace's cache. */

/** The directory, under the cache, every server of a workspace shares. */
export const FORGE_EVENTS_DIR = 'forge-events';

/** One file per event in here, so a watcher sees each as it is written. */
export const FORGE_EVENT_RECORDS_DIR = 'events';

/** Who waits for what, read by every server's notification bridge. */
export const FORGE_EVENT_SUBSCRIPTIONS_FILE = 'subscriptions.json';

/** An event file older than this is removed by the next write. */
export const FORGE_EVENT_RETENTION_MS = 3_600_000;

/** The most subscriptions kept; the oldest go first. */
export const FORGE_EVENT_MAX_SUBSCRIPTIONS = 500;

/** What this host last delivered of each subscribed pull request. */
export const FORGE_EVENT_CURSOR_FILE = 'cursor.json';

/** The most delivered events remembered per pull request; the oldest go first. */
export const FORGE_EVENT_CURSOR_KEYS = 20;
