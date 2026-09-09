/**
 * development-policy.interface.ts — the single machine-readable authority
 * for HOW a workspace develops and integrates work.
 *
 * Before this contract the answer was spread across `agentWorktree`, the
 * `commit-policy` plugin options, `.github/settings.yml`, the branch
 * guards and the bootstrap prose, with no way to tell which one won. This
 * file defines the resolved policy every one of those must now derive
 * from, so a project states its model once and the runtime, the guards
 * and the forge governance all read the same answer.
 *
 * The model is deliberately NOT a single `mode` enum. Workspace layout,
 * work persistence, checkpoint cadence, integration, coordination,
 * recovery and governance are orthogonal: a project can share a checkout
 * and still integrate directly, or use worktrees and still require pull
 * requests. Profiles (see `development-policy/profiles.ts`) exist only as
 * ergonomic presets that expand into an explicit policy — the runtime
 * consumes the resolved capability booleans here, never a profile string.
 */

/** How agents get a working tree to edit. */
export const WORKSPACE_STRATEGIES = [
	/** One checkout shared by every agent; nobody changes HEAD. */
	'shared-checkout',
	/** A dedicated `git worktree` per agent, each on its own branch. */
	'agent-worktree',
] as const;
export type WorkspaceStrategy = (typeof WORKSPACE_STRATEGIES)[number];

/** Where an agent's in-progress work is durably written. */
export const PERSISTENCE_STRATEGIES = [
	/** Commit straight onto the integration branch (the historical model). */
	'direct-commit',
	/** Commit into a `wip/*` ref built with plumbing, without checkout. */
	'wip-ref',
	/** Commit onto a normal checked-out branch (worktree model). */
	'branch',
] as const;
export type PersistenceStrategy = (typeof PERSISTENCE_STRATEGIES)[number];

/** When a checkpoint is written. */
export const CHECKPOINT_STRATEGIES = [
	/** Only when a slice closes. */
	'slice',
	/** On a fixed wall-clock interval. */
	'interval',
	/** On slice boundaries AND on an interval, whichever comes first. */
	'continuous',
] as const;
export type CheckpointStrategy = (typeof CHECKPOINT_STRATEGIES)[number];

/** How work reaches the integration branch. */
export const INTEGRATION_STRATEGIES = [
	/** Push onto the integration branch (gated only by local policy). */
	'direct',
	/** Open a pull request and let required checks decide. */
	'pull-request',
] as const;
export type IntegrationStrategy = (typeof INTEGRATION_STRATEGIES)[number];

/** How concurrent agents avoid clobbering each other. */
export const COORDINATION_STRATEGIES = [
	/** No coordination — single-agent projects only. */
	'none',
	/** Advisory file locks on disk. */
	'file-locks',
	/** Transactional claims + leases in the operational SQLite state. */
	'sqlite-leases',
] as const;
export type CoordinationStrategy = (typeof COORDINATION_STRATEGIES)[number];

/** What happens to work whose owner disappeared. */
export const RECOVERY_STRATEGIES = [
	/** Abandoned work is not tracked; a new owner starts over. */
	'none',
	/** Abandoned work becomes RECOVERABLE and a new owner continues it. */
	'resume-wip',
] as const;
export type RecoveryStrategy = (typeof RECOVERY_STRATEGIES)[number];

/** How much authority the runtime has over the forge's own settings. */
export const GOVERNANCE_STRATEGIES = [
	/** Do not look at forge settings at all. */
	'none',
	/** Read live settings and report drift, but never write. */
	'observed',
	/** Reconcile live settings against this policy. */
	'enforced',
] as const;
export type GovernanceStrategy = (typeof GOVERNANCE_STRATEGIES)[number];

/** Merge shapes a forge can perform for us. */
export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

/**
 * Where a resolved policy came from. Surfaced so `doctor` and the startup
 * report can tell "this project chose the model" from "we inferred the
 * model from pre-policy fields", which is the difference between a
 * deliberate configuration and one that still needs migrating.
 */
export const POLICY_SOURCES = [
	/** An explicit `development` block naming a profile. */
	'profile',
	/** An explicit `development` block with hand-written axes. */
	'explicit',
	/** Derived from `agentWorktree` / `commit-policy` (no `development`). */
	'legacy-compat',
	/** Nothing configured at all — the conservative built-in default. */
	'default',
] as const;
export type PolicySource = (typeof POLICY_SOURCES)[number];

/** Branch identities. Never inferred from the forge's `default_branch`. */
export interface IPolicyBranches {
	/** Where agents integrate. `develop` here, NOT the forge default. */
	readonly integration: string;
	/** Where releases land. Held to a stricter policy than integration. */
	readonly release: string;
	/**
	 * Template for a unit of work's ref. Placeholders: `${agent}`,
	 * `${proposal}`, `${slice}`, `${generation}`. Empty when the
	 * persistence strategy writes no per-unit ref.
	 */
	readonly workRefTemplate: string;
	/** Prefix a reaper may consider managed. Empty disables cleanup. */
	readonly workRefPrefix: string;
}

/** Workspace axis, plus the capability booleans the runtime reads. */
export interface IPolicyWorkspace {
	readonly strategy: WorkspaceStrategy;
	/** True when several agents edit one tree — implies claims are needed. */
	readonly shared: boolean;
	/** True when each agent gets its own worktree and may change HEAD. */
	readonly agentWorktrees: boolean;
	/**
	 * True when no agent may run `switch`/`checkout`/`reset --hard` on the
	 * visible tree. The agent tool surface is filtered on this.
	 */
	readonly pinnedCheckout: boolean;
}

/** Persistence axis. */
export interface IPolicyPersistence {
	readonly strategy: PersistenceStrategy;
	/** True when work is written to refs built without changing HEAD. */
	readonly usesWipRefs: boolean;
	/**
	 * True when a checkpoint may contain ONLY the claimed paths, built via
	 * a temporary index. Forbids `git add .` / `git add -A` outright.
	 */
	readonly exactScope: boolean;
	/** True when work may be committed straight to the integration branch. */
	readonly allowsDirectIntegrationCommit: boolean;
}

/** Checkpoint cadence. */
export interface IPolicyCheckpoint {
	readonly strategy: CheckpointStrategy;
	/** Minutes between durability checkpoints; 0 when interval is unused. */
	readonly intervalMinutes: number;
	/**
	 * True when a checkpoint may be written even if it is red. Durability
	 * checkpoints exist to not lose work, never to be merged.
	 */
	readonly durableWip: boolean;
}

/** Integration axis — the contract for reaching the integration branch. */
export interface IPolicyIntegration {
	readonly strategy: IntegrationStrategy;
	readonly requiresPullRequest: boolean;
	/** Check contexts that must pass. Empty means the forge decides. */
	readonly requiredChecks: readonly string[];
	/**
	 * True when a candidate must be re-validated against the CURRENT
	 * integration head before merging, not merely against the head it was
	 * branched from. This is what stops two independently-green PRs from
	 * combining into a red integration branch.
	 */
	readonly requireLatestIntegration: boolean;
	/**
	 * True when a coherent, green part of a slice should be integrated as
	 * soon as it is ready instead of waiting for the whole slice.
	 */
	readonly mergeGreenProgressContinuously: boolean;
	readonly mergeMethod: MergeMethod;
	readonly deleteMergedWorkRef: boolean;
	readonly linearHistory: boolean;
	readonly allowForcePush: boolean;
	readonly allowDeleteIntegrationBranch: boolean;
}

/** Coordination axis. */
export interface IPolicyCoordination {
	readonly strategy: CoordinationStrategy;
	/** True when an agent must own a path before writing it. */
	readonly requiresClaims: boolean;
	/** Minutes before an un-renewed lease is considered dead; 0 = never. */
	readonly leaseTtlMinutes: number;
}

/** Recovery axis. */
export interface IPolicyRecovery {
	readonly strategy: RecoveryStrategy;
	/** True when a new owner continues an existing ref rather than restarting. */
	readonly resumeExistingWork: boolean;
	/**
	 * True when unmerged work is never deleted on age alone — only on
	 * durable evidence that it is already represented in the integration
	 * branch, or on an explicit deprecation.
	 */
	readonly neverDiscardUnmergedWork: boolean;
}

/** Forge governance axis. */
export interface IPolicyGovernance {
	readonly strategy: GovernanceStrategy;
	/** True when the runtime may WRITE forge settings, not just read them. */
	readonly enforced: boolean;
	/**
	 * True when a property that could not be evaluated must be reported as
	 * NOT_EXECUTABLE and treated as a failure, never quietly as a pass.
	 */
	readonly failClosedOnUnverifiable: boolean;
}

/**
 * The resolved policy. Every consumer — orchestrator, claims, commit
 * policy, WIP engine, PR engine, startup reconciler, branch guards, forge
 * governance, cleanup, agent tool surface and the generated docs — reads
 * THIS, and never re-derives the answer from raw config or from a profile
 * name.
 */
export interface IResolvedDevelopmentPolicy {
	/**
	 * Schema version of the policy shape itself, so a future change has a
	 * known migration path instead of open-ended heuristics.
	 */
	readonly version: number;
	/** The preset this expanded from, or `custom` when hand-written. */
	readonly profile: string;
	readonly source: PolicySource;
	readonly branches: IPolicyBranches;
	readonly workspace: IPolicyWorkspace;
	readonly persistence: IPolicyPersistence;
	readonly checkpoint: IPolicyCheckpoint;
	readonly integration: IPolicyIntegration;
	readonly coordination: IPolicyCoordination;
	readonly recovery: IPolicyRecovery;
	readonly governance: IPolicyGovernance;
}

/** Current `IResolvedDevelopmentPolicy.version`. */
export const DEVELOPMENT_POLICY_VERSION = 1;

/**
 * A rejected policy combination. Startup fails closed with these rather
 * than improvising a behaviour the operator never asked for.
 */
export interface IDevelopmentPolicyViolation {
	/** Stable id so tests and docs can reference a rule without prose. */
	readonly rule: string;
	/** Dotted path of the offending axis, e.g. `coordination.strategy`. */
	readonly path: string;
	/** What is wrong, in one sentence. */
	readonly message: string;
	/** The concrete change that resolves it. */
	readonly remedy: string;
}
