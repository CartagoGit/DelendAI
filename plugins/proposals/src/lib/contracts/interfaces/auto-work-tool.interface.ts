import type { ICommitAuthorResolution } from '@delendai/core/contracts';
import type { IContinueProposalToolOptions } from '../../tools/continue-proposal.tool';
import type { IAutoWorkPersistMode } from '../../tools/auto-work-persist';
import type {
	IRescueCandidate,
	ISmokeResidualBranch,
} from './swarm-hygiene.interface';
import type { IStashEntry } from '../../shared/stash-snapshot';
import type { IToolCall } from '../../agents/agent-loop-detector';

/**
 * Optional persistence step the orchestrator can opt into at slice
 * close time. Three modes — `'none'` (default, no git), `'commit'`,
 * `'commit-and-push'`. See l109 §2 for the rationale; the actual git
 * mutation happens inside `close_slice`, while `auto_work` remains a
 * read-only planner that surfaces the configured persistence contract.
 */
export interface IAutoWorkPersistConfig {
	readonly mode: IAutoWorkPersistMode;
	/**
	 * Conventional-Commits template. Default:
	 * `<area>(<proposalId>): <sliceId>`. Forwarded to the
	 * `close_slice` persistence step.
	 */
	readonly messageTemplate?: string;
	/**
	 * Push target. Default: `origin HEAD`. The push to `main` is
	 * always refused (safety net); use an explicit branch like
	 * `origin agent/<name>` for worktrees.
	 */
	readonly pushTarget?: string;
	readonly protectedBranches?: readonly string[];
}

export interface IAutoWorkOrchestrationConfig {
	/**
	 * Number of main-thread tool calls after which the returned plan should
	 * push the agent toward `<prefix>_continue_proposal mode:"plan"` +
	 * `<prefix>_delegate`. The tool cannot know slice size before the
	 * proposal is inspected, so this is a compact policy hint for the
	 * orchestrator's next decision.
	 */
	readonly delegateAfterToolCalls?: number;
}

export interface IAutoWorkToolOptions extends IContinueProposalToolOptions {
	/**
	 * a00069 S7: when true (default), auto_work short-circuits proposals in
	 * `review/` without peer approve to `next: proposal_review`.
	 */
	readonly requirePeerReview?: boolean;

	/**
	 * Whether a peer plugin is loaded, read at call time. A plan names a
	 * plugin's tools only when it is; absent, every conditional step is
	 * kept, as before.
	 */
	readonly isPluginLoaded?: ((name: string) => boolean) | undefined;
	/**
	 * The registered name of a peer plugin's tool. Absent, a step names it
	 * by its plugin and tool id only.
	 */
	readonly toolNameOf?:
		| ((plugin: string, toolId: string) => string)
		| undefined;
	/**
	 * The project's resolved development policy. A plan opens with the
	 * work model it names, so an agent following only the plan starts and
	 * lands work the way the policy says.
	 */
	readonly developmentPolicy?:
		| import('@delendai/core/public').IResolvedDevelopmentPolicy
		| undefined;
	/** f00073: absolute workspace root, used by the branch-status warning pass. */
	readonly workspaceRoot?: string;
	/** Quality-gate command to run before closing a slice, if any. */
	readonly validationCommand?: string;
	/**
	 * Default persistence mode for this workspace. Configured via
	 * `delendai.config.json#plugins.proposals.persist.mode`. The
	 * orchestrator can still override per call via `args.persist`.
	 */
	readonly persist?: IAutoWorkPersistConfig;
	readonly orchestration?: IAutoWorkOrchestrationConfig;
	readonly loopDetector?: any;
	/**
	 * Tool names the loop detector MUST skip. Defaults to `[<prefix>_auto_work]`
	 * so the in-tool `consecutiveIdle` streak (3 consecutive idle returns) is
	 * the sole brake for `auto_work` no-args calls — otherwise a user calling
	 * `auto_work` three times in a row on a cascade with no actionable proposal
	 * gets a hard `stop: true` from the detector even though the cascade still
	 * has work to return on the next call. The detector is still wired and
	 * still fires on actual loops (same `agent_lock claim` retried, same
	 * `sync_proposals` retried, etc.).
	 */
	readonly loopDetectorDisableFor?: readonly string[];
	/**
	 * Default for the per-call `includePaused` arg: when true, the
	 * auto_work plan falls back to a paused-proposals cascade when
	 * the standard cascade has no actionable candidates. Default false
	 * — paused proposals never interrupt the normal pick. Configurable
	 * per workspace via `delendai.config.json#plugins.proposals.
	 * autoWork.includePaused` so a single-agent session that is happy
	 * to reopen paused work can default-on it without re-typing the
	 * arg on every call.
	 */
	readonly defaultIncludePaused?: boolean;
	/**
	 * f00078 S1: when `true`, the auto_work front-hook refuses to
	 * return a plan unless the active branch is `agent/<name>`.
	 * Hosts that have the agentWorktree gate on (delendai.config.json
	 * has `agentWorktree: true`) MUST pass `true` here. Hosts that
	 * run solo without worktree isolation pass `false` (or omit).
	 */
	readonly agentWorktreeEnabled?: boolean;
	/**
	 * f00078 S3: sliding window of recent tool calls the host has
	 * observed (typically populated by the lock-file change listener).
	 * When present, auto_work runs the post-fix loop detector
	 * (x00074) on this window before rendering the plan, and
	 * returns `loop-blocked` if it fires. Omit the field (or pass
	 * an empty array) to skip the check.
	 */
	readonly loopDetectorWindow?: readonly IToolCall[];
	/** x00074 S2: window in ms; defaults to 30s. */
	readonly loopDetectorCooldownMs?: number;
	/** x00074 S3: opt-in; when true, the progressHash gate runs. */
	readonly loopDetectorProgressGate?: boolean;
	/** f00082: resolved commit-author policy. */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
	/**
	 * Per-instance idle-streak counter (x00509 / B2). Holds the running
	 * count of consecutive idle responses this registration has
	 * emitted. Created ONCE per `buildAutoWorkRegistration` call and
	 * passed back through `runAutoWork`, so two registrations in the
	 * same process — or two vitest files importing the same module —
	 * never share state. The streak is private to the registration
	 * closure; tests that need to reset it must hold a reference to
	 * the `IIdleStreak` (typically via `buildAutoWorkRegistration`'s
	 * return value) instead of relying on a module-scope variable.
	 */
	readonly idleStreak?: IIdleStreak | undefined;
}

/**
 * Per-instance counter for the `auto_work` anti-idle brake. Encapsulating
 * the counter in a closure-owned object replaces the previous
 * `let consecutiveIdle = 0` module-scope mutation, which leaked across
 * vitest files and across two registrations of `auto_work` in the same
 * process. The holder is created by `buildAutoWorkRegistration` and
 * shared with `runAutoWork` via `IAutoWorkToolOptions.idleStreak`.
 */
export interface IIdleStreak {
	/**
	 * Current count of consecutive idle responses emitted. Intentionally
	 * mutable (NOT `readonly`) so test fixtures can construct a
	 * plain object literal with `{ count: 0, reset, increment }` and
	 * have `runAutoWork` observe the same shape it consumes. The
	 * production factory in `createIdleStreak` keeps the field
	 * private-via-closure and exposes it through the getter.
	 */
	count: number;
	/** Reset the count to 0 — used by work/branch-blocked branches. */
	reset(): void;
	/** Increment and return the new count (used by the idle branch). */
	increment(): number;
}

export interface IAutoWorkOrchestrationPolicy {
	// Proposal sitting in review/ without an independent
	// peer approve must surface proposal_review before any done step.
	readonly lane: 'inspect-then-delegate';
	readonly delegateAfterToolCalls: number;
	readonly next: string;
	readonly policy: string;
}

/**
 * The first currently-claimable slice, embedded in a work response so a host
 * can claim it without a second planning round trip. `agent` is deliberately
 * a placeholder: the host owns the session identity and must replace it with
 * its resolved agent name before calling the write-side lock tool.
 */
export interface IAutoWorkClaimReady {
	readonly sliceId: string;
	readonly files: readonly string[];
	readonly gate: 'lint' | 'type' | 'e2e' | 'none';
	readonly agent_lock_args: {
		readonly action: 'claim';
		readonly task_id: string;
		readonly agent: '<host-resolved-agent>';
		readonly files: readonly string[];
	};
}

export interface IContinueProposalPlanPayload {
	readonly kind: string;
	readonly claimableSliceIds?: readonly string[];
	readonly plan?: {
		readonly slices: readonly {
			readonly sliceId: string;
			readonly files: readonly string[];
			readonly gate: IAutoWorkClaimReady['gate'];
			readonly status: string;
		}[];
	};
}

export interface IClaimReadyResolution {
	readonly claimReady?: IAutoWorkClaimReady | undefined;
	readonly missingDoneArtifacts: readonly string[];
	/** A pending slice with every declared artifact tracked needs verification, not re-execution. */
	readonly pendingTrackedArtifacts: readonly string[];
}

/**
 * f00075 S4: front-hook decision payload. Combines the swarm-hygiene
 * engine (`rescueCandidates` / `gcEligible` / `outOfCache`) with the
 * stash snapshot (`stashes`) and computes the four-state
 * `executionMode` plus the human-readable `hygieneBlockers` /
 * `hygieneActions` / `hygieneWarnings` arrays.
 *
 * Pure over (workspaceRoot, run, forceBypass). Never throws: any
 * internal failure collapses to `executionMode: 'normal'` with empty
 * arrays so the plan proceeds (fail-soft — same contract as
 * `collectBranchStatusWarnings`).
 */
export interface IHygieneFrontHook {
	readonly executionMode: 'normal' | 'confirm-required' | 'blocked';
	readonly hygieneBlockers: readonly string[];
	readonly hygieneActions: readonly string[];
	readonly hygieneWarnings: readonly string[];
	readonly rescueCandidates: readonly IRescueCandidate[];
	readonly smokeResiduals: readonly ISmokeResidualBranch[];
	readonly gcEligibleCount: number;
	readonly outOfCacheCount: number;
	readonly stashes: readonly IStashEntry[];
}
