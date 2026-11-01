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

/**
 * The most any tool result may carry, whatever the tool. A net for an answer
 * that ran away, not a way to shorten one: past it the agent gets a failure
 * and pays a second read, so a reviewer's evidence (364 KB measured) must not
 * sit near the routine case. A tool that needs less says so with its own
 * page and detail arguments.
 */
export const TOOL_RESULT_CEILING_BYTES = 256 * 1024;

/** Room kept inside the cap for the artefact path an elided result carries. */
export const ARTIFACT_PATH_RESERVE_BYTES = 512;
