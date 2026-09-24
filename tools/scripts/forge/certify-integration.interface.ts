/** A workflow run of the CI workflow, as the forge reports it. */
export interface ICertificationRun {
	readonly event: string;
	readonly head_sha: string;
	readonly conclusion: string | null;
	readonly status: string;
}
