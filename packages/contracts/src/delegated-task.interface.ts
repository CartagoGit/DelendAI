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
	/**
	 * What the task named as context but could not be given, and why: a
	 * file the workspace lacks, a source that failed. Absent when nothing
	 * is missing, so "no context" and "context unreadable" never look alike.
	 */
	readonly missingContext?:
		| readonly { readonly id: string; readonly reason: string }[]
		| undefined;
	/** Whether it may ask for more context, and through which tool. */
	readonly moreContext: {
		readonly allowed: boolean;
		readonly via?: string | undefined;
	};
}

/** Whether a delegation went with a manifest or with an instruction only. */
export type IDelegationKind = 'manifest' | 'instruction-only';

/** Where a dispatch's tool result carries its delegation records (`_meta`). */
export const DELEGATION_RECORDS_META_KEY = 'delendai/delegations';

/**
 * One delegated step, as it is measured: what it was given and what it
 * cost. Observed token figures are the host's, and absent when the host
 * reports only a total.
 */
export interface IDelegationRecord {
	readonly tags: readonly string[];
	readonly role: string;
	readonly delegation: IDelegationKind;
	/** How a manifest reached the subagent. */
	readonly path?: 'prompt' | 'enforced' | undefined;
	readonly manifestBytes?: number | undefined;
	readonly tokensUsed: number;
	readonly inputTokens?: number | undefined;
	readonly outputTokens?: number | undefined;
	/** The subagent asked for context beyond its manifest. */
	readonly contextRequested?: boolean | undefined;
}
