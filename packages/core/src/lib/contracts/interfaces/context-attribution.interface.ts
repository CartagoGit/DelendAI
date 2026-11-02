/** One source of the bytes a session put into the agent's context. */
export interface IContextShare {
	/** `tools/list`, a tool name, or `other tools` for the remainder. */
	readonly source: string;
	readonly bytes: number;
	/** `bytes / totalBytes`, to four decimals. */
	readonly share: number;
}

/** One tool response, among the largest of the session. */
export interface ILargestResponse {
	readonly tool: string;
	readonly bytes: number;
	/** When it was returned, ISO 8601. */
	readonly at: string;
}

/**
 * Where the bytes this server sent into the agent's context went: the
 * tool definitions `tools/list` served, and each tool's responses. The
 * parts always add up to `totalBytes`; `largestResponses` names the
 * single calls that cost the most.
 */
export interface IContextAttribution {
	readonly totalBytes: number;
	readonly parts: readonly IContextShare[];
	readonly largestResponses: readonly ILargestResponse[];
}
