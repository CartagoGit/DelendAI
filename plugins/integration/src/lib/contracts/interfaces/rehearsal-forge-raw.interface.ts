/** The workflow runs and check runs as the forge's REST API lists them. */

export interface IRawRun {
	id: number;
	name?: string | null;
	event: string;
	head_branch?: string | null;
	head_sha: string;
	status?: string | null;
	conclusion?: string | null;
	actor?: { login?: string } | null;
	created_at: string;
	updated_at: string;
}

export interface IRawCheckRun {
	id: number;
	name: string;
	head_sha: string;
	status?: string | null;
	conclusion?: string | null;
	started_at?: string | null;
}
