/**
 * escalation.interface.ts — data contracts for quality UP-escalation.
 *
 * SRP: shapes only. The ladder builder + the run-with-gate orchestrator live
 * in `escalate/`. The escalation direction is the INVERSE of a resilience
 * fallback: on an acceptance-gate *quality* failure the runner re-routes to a
 * STRONGER (higher cost-tier) provider — "if the cheap one couldn't do it,
 * try a better one" — bounded by the user's cost ceiling.
 */
import type { IProviderCandidate } from './roster.interface';

/** One step of the escalation ladder: which provider to try, and why. */
export interface IEscalationRung {
	readonly candidate: IProviderCandidate;
	/** 1-indexed position (1 = the first, cheapest-capable pick). */
	readonly step: number;
	readonly rationale: string;
}

/** The ordered plan: try rung 1; on a gate failure, escalate to rung 2, … */
export interface IEscalationPlan {
	readonly ladder: readonly IEscalationRung[];
	/** The highest cost tier the user allows escalation to reach (1…5). */
	readonly costCeiling: number;
	/** Max rungs (primary + escalations). */
	readonly maxDepth: number;
}

/** Inputs to {@link buildEscalationLadder}. */
export interface IBuildLadderInput {
	/** Providers best-first for the user's dial (output of `rankProviders`). */
	readonly ranked: readonly IProviderCandidate[];
	/** Highest cost tier escalation may reach (1…5). Default 5 (no ceiling). */
	readonly costCeiling?: number;
	/** Max rungs incl. the primary. Default 3. */
	readonly maxDepth?: number;
}

/** Injected seams (DIP) for {@link runWithEscalation}. */
export interface IRunEscalationDeps {
	/** Execute the provider on the task; returns its output (opaque here). */
	readonly runProvider: (
		candidate: IProviderCandidate,
		task: string,
	) => Promise<unknown>;
	/** The project's acceptance gate: did the output meet the bar? */
	readonly checkAcceptance: (
		output: unknown,
		candidate: IProviderCandidate,
	) => Promise<boolean>;
}

/** The result of actually running the ladder against the acceptance gate. */
export interface IEscalationOutcome {
	/** True when some rung produced a result that passed the gate. */
	readonly ok: boolean;
	/** The provider whose result passed, or null when every rung failed. */
	readonly chosen: IProviderCandidate | null;
	/** Per-rung record: which provider ran and whether it passed the gate. */
	readonly attempts: ReadonlyArray<{
		readonly candidate: IProviderCandidate;
		readonly passed: boolean;
	}>;
}
