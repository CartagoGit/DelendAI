/**
 * What `integration` says about itself: shared by the command and by the
 * lazy entry that loads it, so its help and its flags cannot drift from it.
 */
export const INTEGRATION_COMMAND = {
	summary:
		'Prove the pull request flow on the real forge: `integration rehearse` plays scenarios on rehearsal branches and prints the report; `integration pass` runs one integrator pass in this project; `integration adopt` renders the workflows into another project; `integration doctor` checks the integrator identity and prints the App manifest.',
	usage: 'integration doctor [--manifest] | integration pass | integration adopt [--needs=<job,job>] | integration rehearse [--mode=fast|real] [--scenarios=<id,id|all>]',
	flags: ['mode', 'scenarios', 'manifest', 'needs'],
	offline: true,
} as const;

/** The rehearsal modes: fast stand-ins, or the project's real CI and scan workflows. */
export const INTEGRATION_REHEARSAL_MODES = ['fast', 'real'] as const;
