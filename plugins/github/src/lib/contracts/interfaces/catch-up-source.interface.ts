/** The seam of GitHub's catch-up source: a `gh` runner and the labels worth telling. */

/** Runs `gh` with `args`; a refusal is an empty or partial `stdout`, never a throw. */
export type IGitHubCatchUpRun = (
	args: readonly string[],
) => Promise<{ readonly stdout: string }>;

export interface IGitHubCatchUpInput {
	readonly run: IGitHubCatchUpRun;
	/** The labels a session waits on: needs-update and culprit. */
	readonly labels: readonly string[];
}
