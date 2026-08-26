/**
 * Domain types for the agent-orchestrator policy engine.
 *
 * Kept in one file to make the contract for downstream slices obvious
 * (S2 linear-mode, S3 swarm-mode, S4 auto-mode). All structural types
 * are readonly and serialisable: they cross the MCP tool boundary.
 */
import { z } from 'zod';

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

/** The full policy the host passes in `mcp-vertex.config.json`. */
export interface IOrchestratorPolicy {
	readonly defaultMode: OrchestrationMode;
	readonly defaults: {
		readonly budget: IBudgetPolicy;
		readonly rotation: IRotationPolicy;
	};
	/** Optional overrides per mode; missing mode falls back to `defaults`. */
	readonly perMode?: Partial<Record<OrchestrationMode, IModeOverride>>;
}

export interface IModeOverride {
	readonly budget?: Partial<IBudgetPolicy>;
	readonly rotation?: Partial<IRotationPolicy>;
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

export const OrchestratorPolicySchema = z.object({
	defaultMode: OrchestrationModeSchema,
	defaults: z.object({
		budget: BudgetPolicySchema,
		rotation: RotationPolicySchema,
	}),
	perMode: z.record(z.string(), z.object({}).passthrough()).optional(),
});

/**
 * Re-export `IModeAdapter` (lives in the registry module) so consumers
 * can `import type { IModeAdapter } from "<plugin>/public"` without
 * reaching into the registry module.
 */
export type { IModeAdapter } from './registry.js';
