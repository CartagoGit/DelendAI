/**
 * plan-closure-guard.ts
 *
 * The "is this plan closable?" guard, composed for use by
 * `proposal_transition` and any other tool that wants to enforce the
 * q00001 closure rule. Single-purpose: take a plan, run the
 * preflight, return either `null` (closable) or a structured blocker
 * report (not closable).
 *
 * SRP: this module owns ONLY the "compose the resolver + run the
 * engine" workflow. It does NOT define the closure logic itself
 * (that's the engine), nor the resolvers (those are in
 * `plan-closure.resolvers.ts`). It is the thin glue that connects
 * them in the way `proposal_transition` needs.
 *
 * Pre-refactor: the same 8-line composition was inlined inside
 * `runProposalTransition`. Inlining was fine for one consumer, but
 * `close-plan.tool.ts` also runs the same composition with slightly
 * different error formatting. Extracting here lets both tools share
 * the wiring and lets tests assert on the guard's contract without
 * driving the whole transition tool.
 */

import { parseProposalDocument } from '../proposals/proposal-document';
import { evaluatePlanClosure } from './plan-closure.engine';
import {
	buildDiskPlanChildrenResolver,
	readOwnSliceStatusesFromDisk,
} from './plan-closure.resolvers';

// ---------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------

export interface IPlanClosureGuardOptions {
	readonly planId: string;
	readonly planAbsPath: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
}

// ---------------------------------------------------------------------------
// Outputs.
// ---------------------------------------------------------------------------

export type PlanClosureGuardResult =
	/** The plan is closable. Proceed with the transition. */
	| { readonly closable: true }
	/** The plan is not closable. Surface the blockers to the caller. */
	| {
			readonly closable: false;
			/** A flat list of `[kind/code] message` lines for log-style rendering. */
			readonly blockerLines: readonly string[];
			readonly blockerCount: number;
	  };

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Run the closure preflight for `planId`. Returns a tagged union so
 * the caller can branch on `closable` without dealing with `null` or
 * throwing exceptions — the guard NEVER throws on a "plan not yet
 * closable" outcome, only on disk-level failures (which are
 * genuinely exceptional and should bubble up).
 */
export const runPlanClosureGuard = async (
	options: IPlanClosureGuardOptions,
): Promise<PlanClosureGuardResult> => {
	const planDoc = await parseProposalDocument(options.planAbsPath);
	const ownSlices = await readOwnSliceStatusesFromDisk(options.planAbsPath);
	const resolver = await buildDiskPlanChildrenResolver({
		indexPathAbs: options.indexPathAbs,
		proposalsDirAbs: options.proposalsDirAbs,
		ownSlices,
	});
	const report = await evaluatePlanClosure({
		planId: options.planId,
		frontmatter: planDoc.frontmatter,
		resolver,
	});
	if (report.closable) {
		return { closable: true };
	}
	return {
		closable: false,
		// Format every blocker as `[kind/code] message` so the caller's
		// error envelope can render them as a bullet list with no extra
		// shape knowledge.
		blockerLines: report.reasons.map(
			(r) => `  - [${r.kind}/${r.code}] ${r.message}`,
		),
		blockerCount: report.reasons.length,
	};
};
