/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface DelendaiGitBlameOutput {
	lines: {
		line: number;
		hash: string;
		author: string;
		date: string;
		content: string;
	}[];
}

export interface DelendaiGitChangedOutput {
	changed: string[];
}

export interface DelendaiGitChangelogOutput {
	bump: "major" | "minor" | "patch" | "none";
	total: number;
	groups: {
		type: string;
		entries: {
			hash: string;
			scope?: string;
			subject: string;
			breaking: boolean;
		}[];
	}[];
}

export interface DelendaiGitDiffOutput {
	stat: string;
}

export interface DelendaiGitLogOutput {
	commits: {
		hash: string;
		subject: string;
	}[];
}

export interface DelendaiGitPrListOutput {
	available: boolean;
	note?: string;
	prs: {
		number: number;
		title: string;
		branch: string;
		url: string;
		draft: boolean;
	}[];
}

export interface DelendaiGitPrViewOutput {
	available: boolean;
	note?: string;
	pr?: {
		number: number;
		title: string;
		state: string;
		url: string;
		mergeable: string;
		reviewDecision: string;
		checks: {
			name: string;
			status: string;
			conclusion: string;
			url: string;
		}[];
	};
}

export interface DelendaiGitShowOutput {
	hash: string;
	author: string;
	date: string;
	subject: string;
	stat: string;
}

export interface DelendaiGitStatusOutput {
	branch?: string;
	clean: boolean;
	entries: {
		status: string;
		path: string;
	}[];
}

export interface DelendaiGitWorktreeOutput {
	worktrees: {
		path: string;
		head: string;
		branch?: string;
		bare?: boolean;
		locked?: boolean;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface GitToolOutputs {
	"delendai_git_blame": DelendaiGitBlameOutput;
	"delendai_git_changed": DelendaiGitChangedOutput;
	"delendai_git_changelog": DelendaiGitChangelogOutput;
	"delendai_git_diff": DelendaiGitDiffOutput;
	"delendai_git_log": DelendaiGitLogOutput;
	"delendai_git_pr_list": DelendaiGitPrListOutput;
	"delendai_git_pr_view": DelendaiGitPrViewOutput;
	"delendai_git_show": DelendaiGitShowOutput;
	"delendai_git_status": DelendaiGitStatusOutput;
	"delendai_git_worktree": DelendaiGitWorktreeOutput;
}
