/**
 * Provisional response budgets for bounded MCP outputs.
 *
 * `DEFAULT_COMPACT_RESPONSE_BYTES` is the compact target for paginated tools.
 * `MAX_RESPONSE_BYTES_CEILING` is the temporary generic default while CHECK-006
 * confirms whether any real callers still require the historical 256 KiB.
 */
export const DEFAULT_COMPACT_RESPONSE_BYTES = 8 * 1024;

export const MAX_RESPONSE_BYTES_CEILING = 64 * 1024;

export const DEFAULT_MAX_RESPONSE_BYTES = MAX_RESPONSE_BYTES_CEILING;
