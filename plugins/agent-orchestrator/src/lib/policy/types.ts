/**
 * Domain types for the agent-orchestrator policy engine.
 *
 * Kept in one file to make the contract for downstream slices obvious
 * (S2 linear-mode, S3 swarm-mode, S4 auto-mode). All structural types
 * are readonly and serialisable: they cross the MCP tool boundary.
 */
import { z } from 'zod';

import type {
	IBudgetOverride,
	IRotationOverride,
} from '../contracts/interfaces/agent-orchestrator.interface.js';

/** The four workflow modes the orchestrator can run. */
export const ORCHESTRATION_MODES = [
	'single',
	'linear',
	'swarm',
	'auto',
] as const;
export type OrchestrationMode = (typeof ORCHESTRATION_MODES)[number];

/** A task as the policy engine sees it — input to the planner. */
export interface ITask {
	/** Stable identifier; required so cached plans and rotations are addressable. */
	readonly id: string;
	/** Human / host-supplied description; the classifier parses this. */
	readonly description: string;
	/** Tags from the host (e.g. `["bug","refactor","audit"]`). Free-form but lowercase. */
	readonly tags: readonly string[];
	/** Estimated size buckets; auto-classifier may use this as a hint. */
	readonly hint?: TaskComplexityHint;
}

export type TaskComplexityHint = 'trivial' | 'small' | 'medium' | 'large';

/** A discrete plan step produced by a mode adapter. */
export interface IPlanStep {
	/** Ordinal in the plan (1-indexed for readability). */
	readonly order: number;
	/** What kind of step it is. */
	readonly kind: PlanStepKind;
	/** Concrete instruction. Modes decide verbosity; the tool result is human-readable. */
	readonly instruction: string;
	/** When `kind === "spawn"`, which subagent role this step instantiates. */
	readonly subagentRole?: SubagentRole;
	/** Optional dependencies — earlier orders that must complete first. */
	readonly dependsOn?: readonly number[];
}

export type PlanStepKind = 'orchestrate' | 'spawn' | 'join' | 'verify';

/**
 * Subagent roles — coarse enough to be useful, fine enough to control
 * budget behaviour. New roles go through `IBudgetPolicy` not by
 * inflating this enum (OCP).
 */
export type SubagentRole =
	| 'scout'
	| 'implementer'
	| 'verifier'
	| 'reviewer'
	| 'scribe';

/** What a mode adapter produces — the plan + the budget profile. */
export interface IModePlan {
	readonly mode: OrchestrationMode;
	/** Why this mode was chosen (classifier rationale for `auto`; static text otherwise). */
	readonly rationale: string;
	/** Ordered list of plan steps; modes decide shape. */
	readonly steps: readonly IPlanStep[];
	/** Budget profile the executor must obey. */
	readonly budget: IBudgetPolicy;
	/** Rotation policy: when a subagent gets replaced mid-task. */
	readonly rotation: IRotationPolicy;
}

/**
 * Budget caps. All numeric fields are *per subtask* unless flagged
 * otherwise. Zero means "no cap (inherit from policy.defaults)".
 */
export interface IBudgetPolicy {
	/** Max tokens the orchestrator may spend on the *whole* task. 0 = unlimited. */
	readonly maxTokensOrchestrator: number;
	/** Max tokens a subagent may spend on a single step. */
	readonly maxTokensPerSubagent: number;
	/** Hard wall-clock timeout for the task in ms. 0 = no timeout. */
	readonly timeoutMs: number;
}

export const DEFAULT_BUDGET_POLICY: IBudgetPolicy = {
	maxTokensOrchestrator: 200_000,
	maxTokensPerSubagent: 50_000,
	timeoutMs: 0,
};

/**
 * Rotation policy for subagents. Triggers are evaluated by
 * `IRotationDetector` implementations; the planner picks them.
 */
export interface IRotationPolicy {
	/** Max iterations a single subagent gets before forced rotate (even mid-task). */
	readonly maxIterationsPerSubagent: number;
	/** Allowed reasons to rotate. Anything not listed ⇒ the step fails (fail-closed). */
	readonly allow: readonly RotationReason[];
}

export type RotationReason =
	| 'token-budget-exhausted'
	| 'schema-violation'
	| 'repeated-output'
	| 'error-storm';

export const DEFAULT_ROTATION_POLICY: IRotationPolicy = {
	maxIterationsPerSubagent: 3,
	allow: [
		'token-budget-exhausted',
		'schema-violation',
		'repeated-output',
		'error-storm',
	],
};

/** The full policy the host passes in `delendai.config.json`. */
export interface IOrchestratorPolicy {
	readonly defaultMode: OrchestrationMode;
	readonly defaults: {
		readonly budget: IBudgetPolicy;
		readonly rotation: IRotationPolicy;
	};
	/** Optional overrides per mode; missing mode falls back to `defaults`. */
	readonly perMode?:
		| Partial<Record<OrchestrationMode, IModeOverride>>
		| undefined;
}

/**
 * `IBudgetOverride`/`IRotationOverride` live in
 * `contracts/interfaces/agent-orchestrator.interface.ts` (added after
 * this file's exports were grandfathered into the types-in-contracts
 * baseline); see that file for why they're bespoke shapes rather than
 * `Partial<IBudgetPolicy>`/`Partial<IRotationPolicy>`.
 */
export interface IModeOverride {
	readonly budget?: IBudgetOverride | undefined;
	readonly rotation?: IRotationOverride | undefined;
}

// ─── Zod schemas (MCP tool surface) ─────────────────────────────────────

export const TaskSchema = z.object({
	id: z.string().min(1),
	description: z.string().min(1),
	tags: z.array(z.string()).default([]),
	hint: z.enum(['trivial', 'small', 'medium', 'large']).optional(),
});

export const OrchestrationModeSchema = z.enum(ORCHESTRATION_MODES);

export const BudgetPolicySchema = z.object({
	maxTokensOrchestrator: z.number().int().nonnegative(),
	maxTokensPerSubagent: z.number().int().nonnegative(),
	timeoutMs: z.number().int().nonnegative(),
});

export const RotationPolicySchema = z.object({
	maxIterationsPerSubagent: z.number().int().positive(),
	allow: z
		.array(
			z.enum([
				'token-budget-exhausted',
				'schema-violation',
				'repeated-output',
				'error-storm',
			]),
		)
		.min(1),
});

/**
 * Overrides are partial policies: any field a host omits inherits
 * `defaults` untouched. `.strict()` rejects unknown keys so a typo
 * (e.g. `budegt`) fails at the config edge instead of silently
 * doing nothing.
 */
export const BudgetOverrideSchema = BudgetPolicySchema.partial().strict();

export const RotationOverrideSchema = RotationPolicySchema.partial().strict();

export const ModeOverrideSchema = z
	.object({
		budget: BudgetOverrideSchema.optional(),
		rotation: RotationOverrideSchema.optional(),
	})
	.strict();

/**
 * `z.record(enumSchema, ...)` requires *every* enum key to be present
 * (zod v4 treats a finite-union key schema as exhaustive); `perMode` is
 * meant to be sparse — a host overrides only the modes it cares about —
 * so this uses `z.partialRecord`, zod's dedicated optional-keys variant.
 */
export const PerModeOverridesSchema = z.partialRecord(
	OrchestrationModeSchema,
	ModeOverrideSchema,
);

export const OrchestratorPolicySchema = z.object({
	defaultMode: OrchestrationModeSchema,
	defaults: z.object({
		budget: BudgetPolicySchema,
		rotation: RotationPolicySchema,
	}),
	perMode: PerModeOverridesSchema.optional(),
});

/**
 * Merge the override registered for `mode` (if any) into `policy.defaults`,
 * producing an effective policy scoped to that one mode. Mode adapters only
 * ever read `policy.defaults` — never `policy.perMode` — so resolving the
 * override here keeps every adapter unchanged when a new override shape is
 * added (OCP): this is the single seam where `perMode` takes effect.
 */
export function resolveEffectivePolicyForMode(
	policy: IOrchestratorPolicy,
	mode: OrchestrationMode,
): IOrchestratorPolicy {
	const override = policy.perMode?.[mode];
	if (!override) return policy;
	return {
		...policy,
		defaults: {
			budget: mergeBudgetOverride(
				policy.defaults.budget,
				override.budget,
			),
			rotation: mergeRotationOverride(
				policy.defaults.rotation,
				override.rotation,
			),
		},
	};
}

/**
 * Per-field merges (rather than an object spread) so a partially-set
 * override can't widen the merged result's field types to include
 * `undefined` — every field of `IBudgetPolicy`/`IRotationPolicy` is
 * required, and an absent override field must fall back to `base`.
 */
function mergeBudgetOverride(
	base: IBudgetPolicy,
	override: IBudgetOverride | undefined,
): IBudgetPolicy {
	return {
		maxTokensOrchestrator:
			override?.maxTokensOrchestrator ?? base.maxTokensOrchestrator,
		maxTokensPerSubagent:
			override?.maxTokensPerSubagent ?? base.maxTokensPerSubagent,
		timeoutMs: override?.timeoutMs ?? base.timeoutMs,
	};
}

function mergeRotationOverride(
	base: IRotationPolicy,
	override: IRotationOverride | undefined,
): IRotationPolicy {
	return {
		maxIterationsPerSubagent:
			override?.maxIterationsPerSubagent ?? base.maxIterationsPerSubagent,
		allow: override?.allow ?? base.allow,
	};
}

/**
 * Re-export `IModeAdapter` (lives in the registry module) so consumers
 * can `import type { IModeAdapter } from "<plugin>/public"` without
 * reaching into the registry module.
 */
export type { IModeAdapter } from './registry.js';
