/**
 * mcp-server-name.constant.ts — the name delendai's own MCP server is
 * registered under when a project names none.
 */

/**
 * The one default for delendai's server key. `init`, `adopt` and the
 * installer each carried their own (`DelendAI`, `delendai`), so a project
 * set up by one and repaired by another ended with two entries, or with
 * agents granting a server that did not exist.
 */
export const DEFAULT_DELENDAI_SERVER_NAME = 'DelendAI';
