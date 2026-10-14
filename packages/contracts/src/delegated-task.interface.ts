/**
 * A task delegated to a subagent: what it is for and everything it may
 * use, so the subagent starts from this and not from the session that
 * delegated it.
 *
 * A request that carries only an `instruction` makes the subagent find
 * the project again, or inherit the parent's whole conversation where the
 * host passes it on. The manifest names what it needs by reference; the
 * subagent opens only what it reads.
 */
export interface IDelegatedTask {
	/** What the subagent is to achieve, in one or two sentences. */
	readonly objective: string;
	/** The hash of the project contract the work is held to. */
	readonly contractHash: string;
	/** The context manifest compiled for the task (context-compiler). */
	readonly manifestId: string;
	/** The tools it may call; nothing else is offered. */
	readonly allowedTools: readonly string[];
	/** The JSON Schema of the output it hands back. */
	readonly outputSchema?: Readonly<Record<string, unknown>> | undefined;
	/** The checks its output must pass, as the orchestrator will run them. */
	readonly acceptance: readonly string[];
	/** The input tokens the task may take. */
	readonly inputBudget: number;
	/** Whether it may ask for more context, and through which tool. */
	readonly moreContext: {
		readonly allowed: boolean;
		readonly via?: string | undefined;
	};
}

/** Whether a delegation went with a manifest or with an instruction only. */
export type IDelegationKind = 'manifest' | 'instruction-only';
