/**
 * What a ref is named after when nothing identified the agent.
 *
 * Deliberately a word an operator can search for, not a hostname that
 * looks like an answer: a ref carrying this says "nobody declared who
 * was working", which is a fixable statement.
 */
export const WORK_AGENT_UNKNOWN = 'unknown-agent';

/**
 * What marks an identity that came from the MCP handshake.
 *
 * The handshake reports the APPLICATION that connected — `claude-code`,
 * `visual-studio-code`, `codex-mcp-client` — which is not the agent that
 * did the work. Unmarked, such a name sits in the graph beside a real
 * model and reads exactly like one. Marked, it says what it is, and the
 * attribution it does carry is kept rather than thrown away.
 */
export const CLIENT_ID_PREFIX = 'client-';
