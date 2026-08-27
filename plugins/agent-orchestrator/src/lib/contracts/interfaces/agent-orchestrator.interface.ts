/**
 * agent-orchestrator.interface.ts — exported types/interfaces added to the
 * plugin after the types-in-contracts convention took effect. Kept under
 * contracts/interfaces per that convention; the plugin's pre-existing
 * `policy/types.ts` exports are grandfathered by the ratchet baseline and
 * intentionally left in place there.
 */
import type { RotationReason } from '../../policy/types.js';

/**
 * Bespoke (not `Partial<...>`-derived) override shapes: every field's
 * `| undefined` union mirrors how zod infers optional object fields
 * under `exactOptionalPropertyTypes`, so `OrchestratorPolicySchema`-
 * parsed values assign to these interfaces without a lossy
 * reconstruction at every call site. `Partial<IBudgetPolicy>` would
 * type each field as bare `?:`, which zod's inferred type is not.
 */
export interface IBudgetOverride {
	readonly maxTokensOrchestrator?: number | undefined;
	readonly maxTokensPerSubagent?: number | undefined;
	readonly timeoutMs?: number | undefined;
}

export interface IRotationOverride {
	readonly maxIterationsPerSubagent?: number | undefined;
	readonly allow?: readonly RotationReason[] | undefined;
}

/** Options accepted by `resolveDispatchPort`. */
export interface IResolveDispatchPortOptions {
	/** Factory the host provides; invoked once with no arguments. */
	readonly portFactory?: unknown;
	/** Explicit opt-in for the deterministic fake port (tests/fixtures only). */
	readonly allowFakeDispatchPort?: boolean;
}
