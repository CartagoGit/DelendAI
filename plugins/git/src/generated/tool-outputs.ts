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

export interface McpVertexGitBlameOutput {
	lines: {
		line: number;
		hash: string;
		author: string;
		date: string;
		content: string;
	}[];
}

export interface McpVertexGitChangedOutput {
	changed: string[];
}

export interface McpVertexGitChangelogOutput {
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

export interface McpVertexGitDiffOutput {
	stat: string;
}

export interface McpVertexGitLogOutput {
	commits: {
		hash: string;
		subject: string;
	}[];
}

export interface McpVertexGitPrListOutput {
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

export interface McpVertexGitPrViewOutput {
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

export interface McpVertexGitShowOutput {
	hash: string;
	author: string;
	date: string;
	subject: string;
	stat: string;
}

export interface McpVertexGitStatusOutput {
	branch?: string;
	clean: boolean;
	entries: {
		status: string;
		path: string;
	}[];
}

export interface McpVertexGitWorktreeOutput {
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
	"mcp-vertex_git_blame": McpVertexGitBlameOutput;
	"mcp-vertex_git_changed": McpVertexGitChangedOutput;
	"mcp-vertex_git_changelog": McpVertexGitChangelogOutput;
	"mcp-vertex_git_diff": McpVertexGitDiffOutput;
	"mcp-vertex_git_log": McpVertexGitLogOutput;
	"mcp-vertex_git_pr_list": McpVertexGitPrListOutput;
	"mcp-vertex_git_pr_view": McpVertexGitPrViewOutput;
	"mcp-vertex_git_show": McpVertexGitShowOutput;
	"mcp-vertex_git_status": McpVertexGitStatusOutput;
	"mcp-vertex_git_worktree": McpVertexGitWorktreeOutput;
}
