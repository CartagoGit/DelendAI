/** What the pull-request step can ask of git and of the forge's CLI. */
export interface IPullRequestPorts {
	/** Git's trimmed output, or `undefined` when it failed. */
	readonly git: (args: readonly string[]) => string | undefined;
	/** The forge CLI's trimmed output, or `undefined` when it failed. */
	readonly gh: (args: readonly string[]) => string | undefined;
}

/** What happened to the publication's pull request. */
export type IPublicationPullRequest =
	| { readonly status: 'opened' | 'existing'; readonly url: string }
	| { readonly status: 'skipped' | 'failed'; readonly reason: string };
