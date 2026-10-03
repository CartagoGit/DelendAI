/** How this clone reaches the driver: a runner and the script it runs. */
export interface IGeneratedMergeDriverInvocation {
	/**
	 * The runtime a caller OBSERVED, kept for compatibility. It is not
	 * trusted: `resolveDriverRuntime` decides, because the observed one is
	 * whatever happened to run the installer and may be unable to execute
	 * the script at all.
	 */
	readonly runner: string;
	/** A runtime the caller insists on, which overrides resolution. */
	readonly explicitRunner?: string | undefined;
	readonly script: string;
}

/** What the clone's configuration says about the driver. */
export interface IGeneratedMergeDriverReport {
	readonly name: string;
	readonly state:
		| 'configured'
		| 'updated'
		| 'unchanged'
		| 'removed'
		| 'absent'
		| 'unsupported';
	/** The command git is configured to run, empty when there is none. */
	readonly command: string;
	readonly reason?: string | undefined;
}
