/**
 * swarm-types.ts
 *
 * Type definitions for the Agent Swarm Governor.
 *
 * - ISwarmBudget: per-session limits (complementary to IProposalBudget the original design)
 * - IContinuityPolicy: declarative policy for session continuity
 * - ISwarmProposalExtension: merged extension returned by parseSwarmFrontmatter
 * - IContinuityViolation: a single policy violation
 * - IContinuityCheckResult: result returned by evaluateContinuityPolicy
 */

// ---------------------------------------------------------------------------
// ISwarmBudget — per-session resource limits (orthogonal to IProposalBudget)
// ---------------------------------------------------------------------------

export interface ISwarmBudget {
	/** Maximum number of active sessions at once (across all users/agents). */
	readonly maxSessionsActive?: number;
	/** Maximum number of subagents spawnable within a single session. */
	readonly maxAgentsPerSession?: number;
	/** Maximum number of total tool retries allowed within a single session. */
	readonly maxToolRetriesPerSession?: number;
	/** Maximum number of reads of core docs (README, index.json, etc.) per session. */
	readonly maxCoreDocRereadsPerSession?: number;
	/**
	 * Declared maximum token budget per turn.
	 * Informational only — not measured from within the workspace (the original design Non-Goals).
	 */
	readonly maxTurnTokens?: number;
}

// ---------------------------------------------------------------------------
// IContinuityPolicy — declarative policy for session continuity enforcement
// ---------------------------------------------------------------------------

export interface IContinuityPolicy {
	/** Maximum number of proposal tasks allowed per session. */
	readonly maxTasksPerSession?: number;
	/** When true, the session must not open new proposals. */
	readonly forbidNewProposals?: boolean;
	/** Maximum number of subagent spawns across the full session. */
	readonly maxAgentSpawnsPerSession?: number;
	/**
	 * Minimum number of retries allowed per tool invocation.
	 * Must be >= 1 when declared; 0 disables the policy without value (invalid).
	 */
	readonly maxToolRetriesPerTool?: number;
	/** When true, each task must emit a checkpoint before the session closes. */
	readonly requireCheckpointAfterTask?: boolean;
	/**
	 * When true, subagents must not re-read core docs whose digest hash is
	 * unchanged since the last known-good read.
	 */
	readonly forbidReReadOnUnchangedDigest?: boolean;
}

// ---------------------------------------------------------------------------
// ISwarmProposalExtension — the merged extension returned by parseSwarmFrontmatter
// ---------------------------------------------------------------------------

export interface ISwarmProposalExtension {
	readonly swarmBudget?: ISwarmBudget;
	readonly continuityPolicy?: IContinuityPolicy;
}

// ---------------------------------------------------------------------------
// IContinuityViolation / IContinuityCheckResult — mirrors IBudgetViolation shape
// ---------------------------------------------------------------------------

export type IContinuityViolationSeverity = 'block' | 'warn';

export interface IContinuityViolation {
	readonly field: string;
	readonly message: string;
	readonly severity: IContinuityViolationSeverity;
}

export interface IContinuityCheckResult {
	readonly withinPolicy: boolean;
	readonly violations: readonly IContinuityViolation[];
}
