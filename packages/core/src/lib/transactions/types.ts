/**
 * transactions/types.ts — f00201 (Track O / q00006 §55).
 *
 * Pure type surface for the workflow-transaction module. A
 * `plan()` is a pure descriptor (no I/O); `execute(plan, options)`
 * walks the steps, runs `step.run`, and on failure calls each
 * previously-executed step's `compensate()` in reverse order.
 *
 * The vocabulary here intentionally matches `IToolEffect` (the
 * canonical tool-side-effect union exposed by `dry-run/protocol.ts`
 * and `tool-registration.interface.ts`).
 *
 * Privacy (R1.1–R1.10): no I/O, no clock, no log sinks here. The
 * executor is the only place that could leak — and it intentionally
 * logs step names + counters only.
 */

import type { IToolEffect } from '../contracts/interfaces/tool-registration.interface';
import type { PermissionCategory } from '../contracts/interfaces/permission.interface';

/**
 * Re-export of `IToolEffect` under a transaction-friendly alias so
 * a plugin can declare `effects: StepEffect[]` without pulling
 * the full contracts barrel. Note: this is intentionally NOT named
 * `Capability` — the `Capability` union in `lib/capabilities/schema.ts`
 * is the structured `group:action` shape and lives in a different
 * semantic space (Track F's gating surface) than the transaction
 * layer's per-step risk declaration.
 */
export type StepEffect = IToolEffect;

/**
 * Risk classification for the whole transaction. Computed by the
 * executor as the max risk across the executed steps' declared
 * effects, so a caller can render a single confirmation prompt.
 */
export type TTransactionRisk = 'low' | 'medium' | 'high';

export type TransactionStateValue = string | number | boolean | null;

export type TTransactionReceiptStage =
	| 'preview'
	| 'approval-required'
	| 'executed'
	| 'replayed'
	| 'failed';

export interface ITransactionExpectedState {
	readonly revision?: string;
	readonly values?: Readonly<Record<string, TransactionStateValue>>;
}

export interface ITransactionCapabilityGrant {
	readonly pluginId?: string;
	readonly toolId?: string;
	readonly permissions: readonly PermissionCategory[];
	readonly approvalRequired: boolean;
	readonly source?: 'manifest-tool' | 'manifest-plugin' | 'merged' | 'manual';
}

export interface ITransactionMetadata {
	readonly id?: string;
	readonly fingerprint: string;
	readonly idempotencyKey?: string;
	readonly expectedState?: ITransactionExpectedState;
	readonly capabilityGrant: ITransactionCapabilityGrant;
}

export interface ITransactionApproval {
	readonly granted: boolean;
	readonly capabilities?: readonly PermissionCategory[];
	readonly approver?: string;
	readonly receipt?: string;
}

export interface ITransactionReceipt {
	readonly stage: TTransactionReceiptStage;
	readonly planId?: string;
	readonly planFingerprint: string;
	readonly idempotencyKey?: string;
	readonly expectedState?: ITransactionExpectedState;
	readonly approvalRequired: boolean;
	readonly approved: boolean;
	readonly approver?: string;
	readonly approvalReceipt?: string;
	readonly requiredCapabilities: readonly PermissionCategory[];
	readonly grantedCapabilities: readonly PermissionCategory[];
	readonly replayed: boolean;
	readonly executedSteps: number;
	readonly totalSteps: number;
}

export interface ITransactionStoredReceipt<T> {
	readonly key: string;
	readonly planFingerprint: string;
	readonly result: ITransactionResult<T>;
}

export interface ITransactionReceiptStore<T> {
	get(key: string): Promise<ITransactionStoredReceipt<T> | undefined>;
	put(record: ITransactionStoredReceipt<T>): Promise<void>;
}

export interface ITransactionPlanOptions {
	readonly id?: string;
	readonly idempotencyKey?: string;
	readonly expectedState?: ITransactionExpectedState;
	readonly capabilityGrant?: ITransactionCapabilityGrant;
}

/**
 * Mapping from a step's declared `effects` to a risk level.
 * Mirrors the dry-run matrix so a workflow that mixes `write` +
 * `network` reports `medium` and one that touches `destructive`
 * reports `high`. Pure, exported for reuse by the executor and
 * any future dry-run preview surface.
 */
export const STEP_EFFECT_RISK: Readonly<Record<StepEffect, TTransactionRisk>> =
	Object.freeze({
		write: 'low',
		spawn: 'medium',
		network: 'medium',
		destructive: 'high',
	});

/**
 * Information passed to a step's `run`. Pure data — no I/O, no
 * clock. The executor fills it in.
 */
export interface IStepContext {
	/** Name of the step currently running. Mirrors `step.name`. */
	readonly stepName: string;
	/** Zero-based index of the step inside the plan. */
	readonly stepIndex: number;
	/** Total number of steps in the plan. */
	readonly stepCount: number;
	/** Whether the executor is in dryRun mode. */
	readonly dryRun: boolean;
	/** Values produced by earlier completed steps, in order. */
	readonly priorValues: readonly unknown[];
}

/**
 * Information passed to a step's `compensate`. The executor calls
 * it on the failing transaction so the step can undo its work.
 */
export interface ICompensationContext {
	/** Name of the step whose compensation is running. */
	readonly stepName: string;
	/** Zero-based index of the step being compensated. */
	readonly stepIndex: number;
	/** Name of the step whose failure triggered compensation. */
	readonly failingStep: string;
	/** Index of the step whose failure triggered compensation. */
	readonly failingStepIndex: number;
	/** Whether the executor is in dryRun mode. */
	readonly dryRun: boolean;
}

/**
 * One row in the compensation ledger. The executor emits one of
 * these for every `compensate()` invocation (whether successful,
 * failed, or skipped). Plugins can surface the ledger to the LLM
 * so it knows what happened.
 */
export interface ICompensationRecord {
	readonly stepName: string;
	readonly stepIndex: number;
	readonly compensable: boolean;
	readonly skipped: boolean;
	readonly ok: boolean;
	readonly error?: unknown;
	readonly skippedReason?: 'not-compensable' | 'no-handler' | 'dry-run';
}

/**
 * A single unit of work in a transaction plan. The executor calls
 * `run` once per step; on failure it walks prior steps in reverse
 * order calling `compensate`.
 *
 * `effects` is a *declaration* — the executor does NOT enforce
 * permissions. The dry-run surface (Track F, f00189) consumes the
 * declaration to compute a risk preview. A step that lies about its
 * effects is a plugin bug, not a transaction-layer bug.
 */
export interface IStep<T> {
	/** Human-readable name, surfaced in logs and the LLM trace. */
	readonly name: string;
	/** Optional deterministic identity for the step's input arguments. */
	readonly fingerprint?: string | undefined;
	/** Declared side effects. Required (use `[]` for pure steps). */
	readonly effects: readonly StepEffect[];
	/** Whether `compensate` is meaningfully defined. Pure signal:
	 *  if `false`, the executor skips even if `compensate` exists. */
	readonly compensable: boolean;
	/** The forward action. Required. */
	run: (ctx: IStepContext) => Promise<T>;
	/**
	 * The undo action. Optional even when `compensable` is `true` —
	 * a step that is *declared* compensable but has no handler is a
	 * no-op compensation (the executor records `skippedReason: 'no-handler'`).
	 */
	compensate?: (ctx: ICompensationContext, prior: T) => Promise<void>;
}

/**
 * The descriptor returned by `plan()`. Pure: building it has no
 * observable effect on the world. The executor consumes it.
 */
export interface ITransactionPlan<T> {
	readonly steps: readonly IStep<T>[];
	readonly meta: ITransactionMetadata;
}

/**
 * Outcome of `execute()`. `ok` is the only signal callers need for
 * branching; the rest of the fields are diagnostics.
 *
 * `values` holds the outputs of every *completed* step. When the
 * transaction succeeded, every step's output is present; when it
 * failed, only the steps that ran before the failure are present.
 */
export interface ITransactionResult<T> {
	readonly ok: boolean;
	readonly values: readonly T[];
	readonly compensations: readonly ICompensationRecord[];
	/** Highest risk across the executed steps' declared effects. */
	readonly risk: TTransactionRisk;
	/** Whether the executor actually mutated anything. */
	readonly dryRun: boolean;
	/** Step count that ran (forward direction). */
	readonly executedSteps: number;
	/** Total step count in the plan. */
	readonly totalSteps: number;
	readonly receipt: ITransactionReceipt;
	/** Set when `ok` is `false`. */
	readonly error?: ITransactionError;
	/** Step names that ran in forward direction, in order. */
	readonly executedStepNames: readonly string[];
}

export interface ITransactionError {
	readonly code:
		| 'approval-required'
		| 'approval-mismatch'
		| 'approval-mismatch'
		| 'expected-state-mismatch'
		| 'idempotency-key-conflict'
		| 'step-failed';
	readonly step: string;
	readonly stepIndex: number;
	readonly cause: unknown;
	readonly expectedState?: ITransactionExpectedState | undefined;
	readonly actualState?: ITransactionExpectedState | undefined;
}

/**
 * Options for `execute()`. The only knob right now is `dryRun`.
 */
export interface IExecuteOptions<T = unknown> {
	readonly dryRun?: boolean;
	readonly approval?: ITransactionApproval;
	readonly currentState?: ITransactionExpectedState | undefined;
	readonly receiptStore?: ITransactionReceiptStore<T>;
}
