import type { IDelegatedTask } from './delegated-task.interface';

/**
 * Host-provided subagent runtime.
 *
 * The MCP server can describe and coordinate subagents, but it cannot invent
 * a native host conversation. Hosts inject this capability at assembly time;
 * it is deliberately absent from JSON configuration.
 */
export interface IHostSubagentRequest {
	readonly role: string;
	readonly instruction: string;
	readonly budget: number;
	readonly slotId: string;
	readonly metadata?: Readonly<Record<string, unknown>> | undefined;
	/**
	 * What the task is and may use. A request without it is a delegation
	 * by instruction only: still served, and counted as such.
	 */
	readonly task?: IDelegatedTask | undefined;
}

/**
 * What a subagent hands back for the orchestrator to decide on: the
 * receipt, not the transcript. The full output stays behind a reference.
 */
export interface IHostSubagentReceipt {
	readonly status: 'done' | 'failed' | 'needs-decision';
	readonly filesChanged: readonly string[];
	readonly checks: readonly {
		readonly command: string;
		readonly ok: boolean;
	}[];
	/** Only what needs the orchestrator's decision. */
	readonly exceptions: readonly string[];
}

export interface IHostSubagentResult {
	readonly subagentId: string;
	readonly tokensUsed: number;
	readonly output: string;
	readonly schemaOk: boolean;
	readonly hadError: boolean;
	readonly receipt?: IHostSubagentReceipt | undefined;
	/** The input and output tokens the host observed, when it counts them. */
	readonly inputTokens?: number | undefined;
	readonly outputTokens?: number | undefined;
	/** The subagent asked for more context than its manifest gave. */
	readonly contextRequested?: boolean | undefined;
}

export interface IHostSubagentRuntime {
	readonly hostId: string;
	/**
	 * True when the host starts its subagents from the request's `task`
	 * manifest and nothing else. Otherwise the instruction it receives is
	 * the manifest rendered as a bounded prompt.
	 */
	readonly enforcesManifest?: boolean | undefined;
	readonly spawnSubagent: (
		request: IHostSubagentRequest,
	) => Promise<IHostSubagentResult>;
}
