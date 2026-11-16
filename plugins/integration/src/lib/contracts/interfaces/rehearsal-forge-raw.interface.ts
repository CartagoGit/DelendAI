/** The workflow runs and check runs as the forge's REST API lists them. */

export interface IRawRun {
	id: number;
	workflow_id?: number;
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

export interface IRawPull {
	number: number;
	state: string;
	draft?: boolean;
	merged_at?: string | null;
	created_at: string;
	node_id: string;
	user?: { login?: string } | null;
	labels?: { name: string }[];
	head: { ref: string; sha: string };
	base: { ref: string };
}

export interface IRawEvent {
	event: string;
	created_at: string;
	label?: { name?: string };
	actor?: { login?: string } | null;
}
