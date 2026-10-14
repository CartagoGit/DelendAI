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
	'Whatever your model or host, these rules bind you. Set DELENDAI_AGENT_ID to your exact model id before any delendai or git call: which model you are is yours to know; how it is written is fixed — lowercase, maker first in letters, then the version your maker publishes for you in a part of its own, then the tier (`glm-5.3-flash`, `qwen-3.8-flash`, never `qwen3-flash`), with no effort word such as `-high`; never a shortened, invented or borrowed id (a re-spelling of an identity already at work is refused); a shell with no declared agent is held to the same rules where the project says unidentified actors are agents. If your host exposes no model id to you at all, do not invent one: a chat provider serving this conversation may publish the model it observed to the provider bridge (`~/.cache/delendai/provider-model.json`), and delendai reads it as your identity when nothing is declared; the project rules on both through its declared `identity` policy axis (close the bridge, or name a default for identities no model named); failing either, say plainly that your host does not supply your model id and stop, instead of guessing. Never unset or override these variables to get a git or delendai call past a refusal (`env -u AI_AGENT git commit`, a cleared DELENDAI_AGENT_ID): the refusal names the unit of work your change belongs in, and a commit made that way is one nobody can trace or review. Never act under another agent’s name or inside its unit: a reviewer that went quiet loses its claims by itself.';
