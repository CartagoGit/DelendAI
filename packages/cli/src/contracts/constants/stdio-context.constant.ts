/** Constants for `../../lib/stdio-context.factory`. */

/**
 * How long one tool call from the CLI may take. Whoever ran the command
 * waits for its answer; the MCP SDK's one minute cut off calls whose
 * writes were still being committed in the server, behind pre-commit
 * hooks that take longer on a loaded machine, and left them half done.
 */
export const CLI_TOOL_CALL_TIMEOUT_MS = 30 * 60 * 1000;
