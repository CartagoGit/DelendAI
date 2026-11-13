/** Constants for `../../shared/server-log`. */

/** Where a server keeps its own log, under the workspace's cache directory. */
export const SERVER_LOG_SEGMENTS: readonly string[] = ['logs', 'mcp-server'];

/** The days of logs kept; older ones are removed when a server starts. */
export const SERVER_LOG_DAYS_KEPT = 10;
