/**
 * forge.interface.ts — types for the git plugin's opt-in GitHub PR/CI tools
 * (`pr_list`, `pr_view`; r00012 consumer). Kept under contracts/interfaces
 * per the repo's types-in-contracts convention.
 */
import type { IArgvExec } from '@mcp-vertex/core/public';

/** A pull request as summarised by `gh pr list`. */
export interface IPullRequest {
	readonly number: number;
	readonly title: string;
	readonly branch: string;
	readonly url: string;
	readonly draft: boolean;
}

/** One CI status check from a PR's `statusCheckRollup`. */
export interface ICiCheck {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
}

/** A pull request's detail as returned by `gh pr view`. */
export interface IPullRequestDetail {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly url: string;
	readonly mergeable: string;
	readonly reviewDecision: string;
	readonly checks: readonly ICiCheck[];
}

/** Result of `gh pr list` (never throws; `available:false` when gh is absent). */
export interface IForgeList {
	readonly available: boolean;
	readonly note?: string;
	readonly prs: readonly IPullRequest[];
}

/** Result of `gh pr view` (never throws; `pr` absent when none matched). */
export interface IForgeView {
	readonly available: boolean;
	readonly note?: string;
	readonly pr?: IPullRequestDetail;
}

/** Options for the git forge tool builder. */
export interface IGitForgeToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable argv exec for tests; production uses the shared runner. */
	readonly forgeExec?: IArgvExec;
}
