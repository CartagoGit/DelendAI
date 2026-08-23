export interface IBuildIssueBodyInput {
	readonly toolName: string;
	readonly error: unknown;
	readonly signature: string;
	readonly argsJson: string;
	readonly elapsedMs?: number | undefined;
	readonly ts: string;
	readonly namespacePrefix: string;
	readonly host?: string | undefined;
	readonly model?: string | undefined;
}
