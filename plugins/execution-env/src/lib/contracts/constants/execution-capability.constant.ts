/**
 * What an execution environment can promise. A caller asks for the
 * capabilities it needs and refuses an environment that lacks one,
 * instead of discovering the gap halfway through a slice.
 *
 * Closed on purpose: an open set becomes free text nobody can compare.
 */
export const EXECUTION_CAPABILITIES = [
	/** Files written by one command are still there for the next. */
	'persistent-workspace',
	/** The command cannot see the host filesystem beyond what was mounted. */
	'isolated-filesystem',
	/** The command has no route to the network. */
	'isolated-network',
	/** Commands can be run through a bash-compatible shell. */
	'shell-bash',
	/** Commands can be run through PowerShell. */
	'shell-pwsh',
	/** The environment can be stopped and resumed without losing state. */
	'suspend-resume',
	/** Secrets from the host (an ssh-agent, for one) reach the command. */
	'forward-secrets',
	/** State survives from one slice to the next. */
	'preserve-between-slices',
] as const;
