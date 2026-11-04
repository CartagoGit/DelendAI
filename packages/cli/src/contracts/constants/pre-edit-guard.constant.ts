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
