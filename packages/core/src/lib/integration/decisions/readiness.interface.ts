/** What decides whether a pull request is ready, read off the forge for its head. */
export interface IPullRequestChecks {
	readonly draft: boolean;
	/** The checks on the head commit, by name. */
	readonly checks: readonly {
		readonly name: string;
		readonly conclusion: string | null;
	}[];
	/** The checks the integration branch requires. */
	readonly required: readonly string[];
	/** True only where the policy opts in to landing with no required check. */
	readonly withoutChecks: boolean;
	readonly labels: readonly string[];
	/** The labels that keep a pull request out of the queue. */
	readonly blockingLabels: readonly string[];
}
