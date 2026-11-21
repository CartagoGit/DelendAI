/** A workflow run of the CI workflow, as the forge reports it. */
export interface ICertificationRun {
	readonly event: string;
	readonly head_sha: string;
	/** The branch the run is for; a pull request's is its head branch. */
	readonly head_branch?: string;
	readonly conclusion: string | null;
	readonly status: string;
}

export type { IIntegrationCertification } from '@delendai/core/cli';
