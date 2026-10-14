/** Injected exec seam — production uses the shared `gh` runner. */
export type IGhExec = (
	argv: readonly string[],
) => Promise<{ ok: boolean; code: number; stdout: string; stderr: string }>;

export type IGhResult<T> =
	| { readonly ok: true; readonly data: T }
	| { readonly ok: false; readonly reason: string };

export interface ITriageIssueSummary {
	readonly number: number;
	readonly title: string;
	readonly labels: readonly string[];
	readonly updatedAt: string;
}

export interface ITriageIssueDetail {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly labels: readonly string[];
	readonly commentCount: number;
	readonly hasBotReply: boolean;
}

export interface ICommentResult {
	readonly number: number;
	readonly url?: string | undefined;
}
