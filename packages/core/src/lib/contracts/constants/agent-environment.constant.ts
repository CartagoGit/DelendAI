/**
 * agent-environment.constant.ts — the variables an agent runtime sets in
 * the shells it drives, which a person's shell does not.
 *
 * delendai exists to keep agents from leaving a mess behind; it must not
 * get in the way of a person using their own repository. Some rules
 * (never `git stash`, never commit on the integration branch) therefore
 * apply to agents only, and this is the one place that says what "an
 * agent is running this" looks like, whatever its model or host.
 *
 * Any runtime can identify itself through `DELENDAI_AGENT_ID`, which is
 * also how delendai names the agent's work refs. The host markers below
 * are a second net for runtimes that never heard of delendai.
 */

/** delendai's own declaration of who is working. */
export const AGENT_IDENTITY_VARIABLE = 'DELENDAI_AGENT_ID';

/**
 * Exported by the delendai CLI and server for every process they start,
 * so a git call that a delendai tool makes is recognised as an agent's
 * even when the host sets nothing. Kept apart from the host markers: it
 * is a statement about the call, not about the shell, and it never
 * overrides the CI exemption.
 */
export const DELENDAI_SESSION_VARIABLE = 'DELENDAI_SESSION';

/** Variables that name an agent host exactly. */
export const AGENT_HOST_MARKERS: readonly string[] = [
	// A cross-runtime convention, e.g. `claude-code_<version>_agent`.
	'AI_AGENT',
	// Claude Code, in every shell it spawns.
	'CLAUDECODE',
	'CLAUDE_CODE_ENTRYPOINT',
	// Gemini CLI, opencode.
	'GEMINI_CLI',
	'OPENCODE',
];

/** Prefixes whose variables only an agent host sets (Codex CLI, Cursor). */
export const AGENT_HOST_MARKER_PREFIXES: readonly string[] = [
	'CODEX_',
	'CURSOR_',
];

/** Every environment variable that identifies an agent, in precedence order. */
export const AGENT_ENVIRONMENT_MARKERS: readonly string[] = [
	AGENT_IDENTITY_VARIABLE,
	...AGENT_HOST_MARKERS,
];

/**
 * Every agent, whatever its model or host, is held to the workflow above
 * and names itself the same way. The id is the exact model id, because it
 * names work refs and commit authors and is how reviewers tell whose work
 * a unit is.
 */
export const AGENT_IDENTITY_INSTRUCTION =
	'Whatever your model or host, these rules bind you. Set DELENDAI_AGENT_ID to your exact model id (the one you run as, e.g. `glm-5.3-flash` for GLM 5.3 Flash; never a shortened, invented or borrowed id) before any delendai or git call; a shell with no declared agent is held to the same rules where the project says unidentified actors are agents.';
