import type { AgentHost } from '@mcp-vertex/core/public';

export type IValidationActivityState =
	| 'active'
	| 'stale'
	| 'missing'
	| 'corrupt';

export type IValidationActivitySourceState = 'ok' | 'missing' | 'corrupt';

export type IValidationActivitySourceKind = 'registry' | 'lock' | 'worktree';

export interface IValidationActivityActorHint {
	readonly taskId?: string;
	readonly agentName?: string;
	readonly host?: AgentHost | null;
	readonly model?: string | null;
	readonly branch?: string;
}

export interface IValidationRegistryEntry {
	readonly task_id?: string;
	readonly agent_name?: string;
	readonly host?: AgentHost | null;
	readonly model?: string | null;
	readonly adopted?: boolean;
	readonly status?: 'active' | 'cooldown' | 'orphan' | string;
	readonly last_seen?: string;
	readonly lease_until?: string | null;
	readonly cooldown_until?: string | null;
}

export interface IValidationLockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly host?: AgentHost | null;
	readonly model?: string | null;
	readonly ownership?: readonly string[];
	readonly last_seen?: string;
	readonly parent_task_id?: string;
}

export interface IValidationWorktreeEntry {
	readonly branch?: string;
	readonly path?: string;
	readonly taskId?: string;
	readonly agentName?: string;
	readonly host?: AgentHost | null;
	readonly model?: string | null;
	readonly lastSeen?: string;
	readonly dirtyFiles?: number;
	readonly untrackedFiles?: number;
}

export interface IValidationActivitySource<TEntry> {
	readonly state: IValidationActivitySourceState;
	readonly entries?: readonly TEntry[];
	readonly timestamp?: string | null;
	readonly ageMinutes?: number | null;
	readonly fingerprint?: string;
}

export interface IValidationActivitySignal {
	readonly source: IValidationActivitySourceKind;
	readonly state: IValidationActivityState;
	readonly reason: string;
	readonly taskId: string | null;
	readonly agentName: string | null;
	readonly identity: string | null;
	readonly host: AgentHost | null;
	readonly model: string | null;
	readonly lastSeen: string | null;
	readonly ageMinutes: number | null;
	readonly ownedFiles: readonly string[];
	readonly branch: string | null;
	readonly worktreePath: string | null;
}

export interface IValidationActivityParticipant {
	readonly key: string;
	readonly state: IValidationActivityState;
	readonly reason: string;
	readonly taskId: string | null;
	readonly agentName: string | null;
	readonly identity: string | null;
	readonly host: AgentHost | null;
	readonly model: string | null;
	readonly lastSeen: string | null;
	readonly ageMinutes: number | null;
	readonly ownedFiles: readonly string[];
	readonly branches: readonly string[];
	readonly worktreePaths: readonly string[];
	readonly signals: readonly IValidationActivitySignal[];
	readonly activeSources: readonly IValidationActivitySourceKind[];
}

export interface IValidationActivitySummary {
	readonly activeAgents: number;
	readonly activeTasks: number;
	readonly activeLocks: number;
	readonly activeWorktrees: number;
	readonly evidenceAgeMinutes: number | null;
}

export interface IValidationActivitySnapshot {
	readonly snapshotId: string;
	readonly createdAt: string;
	readonly state: IValidationActivityState;
	readonly consistent: boolean;
	readonly currentActorKey: string | null;
	readonly sourceStates: Readonly<
		Record<IValidationActivitySourceKind, IValidationActivitySourceState>
	>;
	readonly agents: readonly IValidationActivityParticipant[];
	readonly summary: IValidationActivitySummary;
	readonly reasons: readonly string[];
}

export interface IValidationActivityResolverInput {
	readonly now?: string;
	readonly staleAfterMinutes?: number;
	readonly current?: IValidationActivityActorHint;
	readonly registry?: IValidationActivitySource<IValidationRegistryEntry>;
	readonly locks?: IValidationActivitySource<IValidationLockEntry>;
	readonly worktrees?: IValidationActivitySource<IValidationWorktreeEntry>;
}
