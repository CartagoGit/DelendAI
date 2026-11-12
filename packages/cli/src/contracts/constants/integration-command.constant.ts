/**
 * What `integration` says about itself: shared by the command and by the
 * lazy entry that loads it, so its help and its flags cannot drift from it.
 */
export const INTEGRATION_COMMAND = {
	summary:
		'Prove the pull request flow on the real forge: `integration rehearse` plays scenarios on rehearsal branches and prints the report.',
	usage: 'integration rehearse [--mode=fast] [--scenarios=<id,id|all>]',
	flags: ['mode', 'scenarios'],
	offline: true,
} as const;

/** The only rehearsal mode this command runs so far. */
export const INTEGRATION_REHEARSAL_MODES = ['fast'] as const;
