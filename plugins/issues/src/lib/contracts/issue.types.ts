/**
 * Pure data contracts for the `issues` plugin. No logic lives here —
 * the GitHub client (S2), the scaffold builder (S2) and the tools
 * (S3) all consume these shapes. Keeping them in one file makes the
 * full GitHub-issue → scaffold shape reviewable at a glance.
 */

/** One row from a GitHub issue list (`GET /repos/:owner/:repo/issues`). */
export interface IGithubIssueSummary {
	readonly number: number;
	readonly title: string;
	readonly state: 'open' | 'closed';
	readonly labels: readonly string[];
	readonly author: string;
	readonly url: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly commentsCount: number;
}

/** A single comment on a GitHub issue. */
export interface IGithubComment {
	readonly author: string;
	readonly body: string;
	readonly createdAt: string;
	readonly url: string;
}

/** Full detail for one GitHub issue, including its body and comments. */
export interface IGithubIssueDetail extends IGithubIssueSummary {
	readonly body: string;
	readonly comments: readonly IGithubComment[];
}

/**
 * The well-known frontmatter keys persisted on every ingested issue
 * scaffold under `docs/mcp-vertex/proposals/retired/issues/github#<n>-<slug>.md`.
 * `status`/`resolution` track the host-driven lifecycle described in
 * the proposal's `## architecture` section; `proposals` records every
 * proposal id this issue was promoted into (zero, one, or many).
 */
export interface IIssueScaffoldFrontmatter {
	/** Always `'github'` for this plugin (room for other source kinds later). */
	readonly source: 'github';
	/** The GitHub issue number. */
	readonly source_id: number;
	readonly source_url: string;
	readonly source_author: string;
	/** ISO timestamp of when `issues_ingest` first wrote this scaffold. */
	readonly ingested_at: string;
	readonly status: 'ingested' | 'analyzed';
	readonly resolution:
		| 'pending'
		| 'promoted'
		| 'promoted-multiple'
		| 'dismissed';
	/** Proposal ids this issue was promoted into (empty until resolved). */
	readonly proposals: readonly string[];
	/** Required when `resolution: 'dismissed'`. */
	readonly dismiss_reason?: string;
	readonly comments: readonly IGithubComment[];
}

/** The full scaffold: frontmatter + the markdown body persisted to disk. */
export interface IIssueScaffold {
	readonly frontmatter: IIssueScaffoldFrontmatter;
	readonly body: string;
}

/**
 * A lightweight reference to a persisted scaffold, returned by the
 * `issues_*` tools instead of the full body (keeps tool payloads
 * small; callers that need the body read the file directly).
 */
export interface IIssueScaffoldRef {
	readonly filePath: string;
	readonly frontmatter: IIssueScaffoldFrontmatter;
}
