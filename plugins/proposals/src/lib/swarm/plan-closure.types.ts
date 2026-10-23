/**
 * plan-closure.types.ts
 *
 * Pure types for the `plan` proposal kind closure evaluator (q00001).
 *
 * SRP: this module owns ONLY data shapes. No I/O, no logic, no resolver
 * implementations — those live in `plan-closure.strategy.ts`,
 * `plan-closure.engine.ts`, and `plan-closure.resolvers.ts` respectively.
 *
 * Types exposed:
 *   - `IPlanChildSnapshot`: the snapshot the resolver returns per child
 *   - `IPlanClosureReason`: a single blocker, with a typed `code`
 *   - `IPlanClosureReport`: the full evaluation result
 *   - `IPlanClosureGatePolicy`: the strategy object the engine consumes
 *     (replaces reading frontmatter flags directly — see OCP rationale
 *     in `plan-closure.engine.ts`)
 *
 * The resolver contract (`IPlanChildrenResolver`) is intentionally
 * declared in `plan-closure.strategy.ts` because it is an interface that
 * implementations must satisfy; grouping it with the types would create
 * an ISP violation (types are data, strategy is behaviour).
 */

import type { IProposalFrontmatter } from '../proposals/proposal-document';

// ---------------------------------------------------------------------------
// Child domain — what a single "thing a plan depends on" looks like.
// ---------------------------------------------------------------------------

export type IPlanChildKind = 'proposal' | 'plan' | 'slice';

/**
 * Resolver return shape. The engine treats this as an immutable record;
 * resolvers must build a fresh snapshot per call (no aliasing across
 * children — tests rely on this for cross-assertion isolation).
 */
export interface IPlanChildSnapshot {
	readonly ref: string;
	readonly kind: IPlanChildKind;
	readonly status: string;
	/** Required by `requirePeerReview: true`; legacy entries default to true. */
	readonly peerReviewed: boolean;
}

// ---------------------------------------------------------------------------
// Closure gate — the policy object the engine consumes (OCP).
// ---------------------------------------------------------------------------

/**
 * The three boolean knobs of a plan's `closureGate` block, normalised
 * to their defaults. The engine reads ONLY this object — it never
 * touches the raw frontmatter, which keeps the engine decoupled from
 * the YAML shape and lets the caller (close-plan tool, transition tool,
 * or tests) supply a custom policy without re-implementing the engine.
 *
 * Defaults match the hardcoded behaviour pre-refactor:
 *   - requirePeerReview: true
 *   - requireAllSlicesDone: true
 *   - requireAllChildrenDone: true
 *
 * To turn off a check, pass `false` explicitly. The defaults live here,
 * not in the engine, so the engine has no implicit knowledge of "what
 * a plan looks like".
 */
export interface IPlanClosureGatePolicy {
	readonly requirePeerReview: boolean;
	readonly requireAllSlicesDone: boolean;
	readonly requireAllChildrenDone: boolean;
}

export const DEFAULT_CLOSURE_GATE_POLICY: IPlanClosureGatePolicy = {
	requirePeerReview: true,
	requireAllSlicesDone: true,
	requireAllChildrenDone: true,
};

// ---------------------------------------------------------------------------
// Reason — one blocker.
// ---------------------------------------------------------------------------

/**
 * The four codes the engine can surface. `unknown-ref` is reserved for
 * resolvers that want to flag a missing child explicitly (the default
 * resolvers report `status: 'unknown'` instead, which surfaces as
 * `not-done`; `unknown-ref` lets a resolver distinguish "child file
 * missing" from "child file present but in some other state").
 */
export type IPlanClosureReasonCode =
	| 'not-done'
	| 'not-peer-reviewed'
	| 'self-cycle'
	| 'unknown-ref';

export interface IPlanClosureReason {
	readonly ref: string;
	readonly kind: IPlanChildKind;
	readonly code: IPlanClosureReasonCode;
	readonly message: string;
}

// ---------------------------------------------------------------------------
// Report — the engine's only return shape.
// ---------------------------------------------------------------------------

export interface IPlanClosureReport {
	readonly planId: string;
	readonly closable: boolean;
	readonly reasons: readonly IPlanClosureReason[];
	readonly children: readonly IPlanChildSnapshot[];
	/** Recursive depth reached (1 = top-level plan only). */
	readonly depth: number;
}

/**
 * Convenience: pull the closure-gate policy out of a parsed plan's
 * frontmatter, applying defaults. This is the one place where the
 * engine shape meets the YAML shape — keeping it as a free function in
 * the types module (not in the engine) lets tests assert on the
 * mapping without instantiating the engine.
 */
export const policyFromFrontmatter = (
	frontmatter: IProposalFrontmatter,
): IPlanClosureGatePolicy => ({
	requirePeerReview: readBooleanFlag(
		frontmatter.closureGate?.requirePeerReview,
		DEFAULT_CLOSURE_GATE_POLICY.requirePeerReview,
	),
	requireAllSlicesDone: readBooleanFlag(
		frontmatter.closureGate?.requireAllSlicesDone,
		DEFAULT_CLOSURE_GATE_POLICY.requireAllSlicesDone,
	),
	requireAllChildrenDone: readBooleanFlag(
		frontmatter.closureGate?.requireAllChildrenDone,
		DEFAULT_CLOSURE_GATE_POLICY.requireAllChildrenDone,
	),
});

/**
 * Tolerant boolean coercion for YAML quirks (`1`/`0`, `"yes"`/`"no"`,
 * `true`/`false`). Anything unrecognised falls back to the default —
 * the engine must never crash on an exotic frontmatter value.
 */
const readBooleanFlag = (value: unknown, defaultValue: boolean): boolean => {
	if (value === undefined || value === null) return defaultValue;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const v = value.trim().toLowerCase();
		if (['true', 'yes', '1', 'on'].includes(v)) return true;
		if (['false', 'no', '0', 'off', ''].includes(v)) return false;
	}
	return defaultValue;
};
