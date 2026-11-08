/** The editing tools whose writes `delendai guard pre-edit` judges. */
export const EDITING_TOOLS: readonly string[] = [
	'Edit',
	'MultiEdit',
	'Write',
	'NotebookEdit',
];

/** The command a host's pre-edit hook runs. */
export const PRE_EDIT_GUARD_COMMAND = 'delendai guard pre-edit';

/** Where Claude Code reads a project's hooks. */
export const CLAUDE_SETTINGS_RELPATH = '.claude/settings.json';

/** The tools Claude Code's PreToolUse matcher sends to the pre-edit guard. */
export const PRE_EDIT_MATCHER = 'Edit|MultiEdit|Write|NotebookEdit';

/** The host id `init` gives Claude Code. */
export const CLAUDE_HOST_ID = 'claude';

/** The shell tools whose finished calls `delendai guard post-shell` judges. */
export const SHELL_TOOLS: readonly string[] = ['Bash'];

/** The tools Claude Code's PostToolUse matcher sends to the post-shell guard. */
export const POST_SHELL_MATCHER = 'Bash';
