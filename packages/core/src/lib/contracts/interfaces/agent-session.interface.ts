export interface IAgentSessionProposalSummary {
	readonly id: string;
	readonly status: string;
	readonly track: string;
	readonly type: string;
	readonly kind?: string;
}

export interface IAgentSessionWorktreeSnapshot {
	readonly path: string;
	readonly head: string;
	readonly branch?: string;
	readonly detached: boolean;
	readonly locked: boolean;
}

export interface IAgentSessionLockSnapshot {
	readonly task_id: string;
	readonly agent: string;
	readonly ownership: readonly string[];
	readonly started_at: string;
	readonly last_seen: string;
	readonly parent_task_id?: string;
}

export interface IAgentSessionDerivationInput {
	readonly worktrees: readonly IAgentSessionWorktreeSnapshot[];
	readonly locks: readonly IAgentSessionLockSnapshot[];
	readonly proposals: readonly IAgentSessionProposalSummary[];
}

export interface IAgentSession {
	readonly id: string;
	readonly agent: string;
	readonly taskId?: string;
	readonly proposal?: IAgentSessionProposalSummary;
	readonly worktree?: string;
	readonly branch?: string;
	readonly baseCommit?: string;
	readonly currentCommit?: string;
	readonly status?: string;
	readonly lastActivity?: string;
	readonly modifiedFiles: readonly string[];
	readonly cost?: number;
	readonly detached?: boolean;
	readonly locked?: boolean;
}
