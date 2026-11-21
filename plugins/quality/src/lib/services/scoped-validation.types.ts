export type IScopedValidationActivityState =
	| 'active'
	| 'stale'
	| 'missing'
	| 'corrupt';

export type IScopedValidationActivitySourceKind =
	| 'registry'
	| 'lock'
	| 'worktree';

export type IScopedValidationActivitySourceState = 'ok' | 'missing' | 'corrupt';

export type IScopedValidationMode = 'scoped' | 'full' | 'blocked';

export type IScopedValidationOperation =
	| 'validate'
	| 'commit'
	| 'push'
	| 'close'
	| 'review';

export interface IScopedValidationActivityParticipant {
	readonly key: string;
	readonly state: IScopedValidationActivityState;
	readonly taskId: string | null;
	readonly agentName: string | null;
	readonly identity: string | null;
	readonly ownedFiles: readonly string[];
	readonly reason: string;
}

export interface IScopedValidationActivitySnapshot {
	readonly snapshotId: string;
	readonly consistent: boolean;
	readonly currentActorKey: string | null;
	readonly sourceStates: Readonly<
		Record<
			IScopedValidationActivitySourceKind,
			IScopedValidationActivitySourceState
		>
	>;
	readonly agents: readonly IScopedValidationActivityParticipant[];
	readonly summary: {
		readonly activeAgents: number;
		readonly activeTasks: number;
		readonly activeLocks: number;
		readonly activeWorktrees: number;
		readonly evidenceAgeMinutes: number | null;
	};
	readonly reasons: readonly string[];
}

export interface IScopedValidationFileScopeMatch {
	readonly file: string;
	readonly scope: string;
	readonly matchKind: 'prefix' | 'segment' | 'basename' | 'fallback';
}

export interface IScopedValidationInput {
	readonly operation: IScopedValidationOperation;
	readonly ownedFiles: readonly string[];
	readonly scopes: Readonly<
		Record<string, readonly { command: string; expect: string }[]>
	>;
	readonly activity: IScopedValidationActivitySnapshot;
	readonly fallbackToUniversalScope?: boolean;
	readonly universalScopeNames?: readonly string[];
}

export interface IScopedValidationDecision {
	readonly mode: IScopedValidationMode;
	readonly scopeCoverage: 'direct' | 'fallback' | 'full' | 'blocked';
	readonly reason: string;
	readonly snapshotId: string;
	readonly ownedFiles: readonly string[];
	readonly resolvedScopes: readonly string[];
	readonly scopeMatches: readonly IScopedValidationFileScopeMatch[];
	readonly unmatchedFiles: readonly string[];
	readonly fallbackScope: string | null;
	readonly activeAgents: number;
	readonly activeTasks: number;
	readonly activeLocks: number;
	readonly activeWorktrees: number;
	readonly evidenceAgeMinutes: number | null;
	readonly blockingReasons: readonly string[];
}
