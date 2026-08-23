/** Injected exec seam so the network call is unit-testable. */
export interface IIssueExecResult {
	readonly ok: boolean;
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type IIssueExec = (
	argv: readonly string[],
	options?: { readonly cwd?: string | undefined },
) => Promise<IIssueExecResult>;

export interface ISubmitIssueInput {
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly workspaceRootAbs: string;
	readonly toolName: string;
	readonly error: unknown;
	readonly signature: string;
	readonly argsJson: string;
	readonly elapsedMs?: number | undefined;
	readonly namespacePrefix: string;
	readonly host?: string | undefined;
	readonly model?: string | undefined;
}

export interface ISubmitIssueOutcome {
	readonly ok: boolean;
	readonly reason: string;
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
}
