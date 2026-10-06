/** Contract shapes for `./forge-seam.service`. */

/**
 * What one run of the forge CLI produced. The exit code is kept apart
 * from the output because a conditional read answered "not modified"
 * exits non-zero yet still prints the headers that say so.
 */
export interface IForgeCommandResult {
	/** Absent when the process never started (CLI missing, timed out). */
	readonly exitCode?: number | undefined;
	readonly stdout: string;
	readonly stderr: string;
	/** Why the process could not run at all, when it could not. */
	readonly spawnError?: string | undefined;
}

/** Runs the forge CLI with these arguments. Injected so a spec fakes it. */
export type IForgeCommandRunner = (
	args: readonly string[],
) => Promise<IForgeCommandResult>;

export interface IForgeSeamOptions {
	/** `owner/name`, the form the forge API takes. */
	readonly repositorySlug: string;
	readonly run: IForgeCommandRunner;
}

/** A parsed `gh api -i` answer: status line, headers, body. */
export interface IParsedForgeResponse {
	readonly status: number;
	readonly etag?: string | undefined;
	readonly body: string;
}

/** The fields of one forge pull request this seam reads. */
export interface IRawPullRequest {
	readonly number?: number;
	readonly state?: string;
	readonly draft?: boolean;
	readonly merge_commit_sha?: string | null;
	readonly head?: { readonly ref?: string; readonly sha?: string };
	readonly base?: { readonly ref?: string };
}

/** The fields of one forge check run this seam reads. */
export interface IRawCheckRun {
	readonly id?: number;
	readonly name?: string;
	readonly status?: string;
	readonly conclusion?: string | null;
	readonly started_at?: string | null;
	readonly completed_at?: string | null;
	readonly app?: { readonly slug?: string } | null;
}
