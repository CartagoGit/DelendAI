/** A built CLI whose sources moved on after it was built. */
export interface IStaleBuild {
	/** The repository the build sits in. */
	readonly root: string;
	/** The source entry that carries the current rules. */
	readonly sourceEntry: string;
	/** When the build was written, in epoch milliseconds. */
	readonly builtAt: number;
	/** The newest commit to what the build is made from. */
	readonly sourcesAt: number;
}
