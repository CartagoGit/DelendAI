/** How this clone reaches the driver: a runner and the script it runs. */
export interface IGeneratedMergeDriverInvocation {
	readonly runner: string;
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
