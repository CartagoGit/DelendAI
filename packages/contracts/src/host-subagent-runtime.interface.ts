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

export interface IHostSubagentResult {
	readonly subagentId: string;
	readonly tokensUsed: number;
	readonly output: string;
	readonly schemaOk: boolean;
	readonly hadError: boolean;
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
