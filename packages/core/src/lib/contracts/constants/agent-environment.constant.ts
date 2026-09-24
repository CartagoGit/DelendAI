/**
 * agent-environment.constant.ts — the variables an agent runtime sets in
 * the shells it drives, which a person's shell does not.
 *
 * delendai exists to keep agents from leaving a mess behind; it must not
 * get in the way of a person using their own repository. Some rules
 * (never `git stash`) therefore apply to agents only, and this is the one
 * list that says what "an agent is running this" looks like.
 *
 * Only markers that were observed are listed. Any runtime can identify
 * itself through `DELENDAI_AGENT_ID`, which is also how delendai names
 * the agent's work refs.
 */
export const AGENT_ENVIRONMENT_MARKERS: readonly string[] = [
	// delendai's own declaration of who is working.
	'DELENDAI_AGENT_ID',
	// A cross-runtime convention, e.g. `claude-code_<version>_agent`.
	'AI_AGENT',
	// Claude Code, in every shell it spawns.
	'CLAUDECODE',
];
