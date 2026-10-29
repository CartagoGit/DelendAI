/**
 * plan-closure.strategy.ts
 *
 * The `IPlanChildrenResolver` interface — the single contract every
 * resolver (in-memory, disk, future network-backed, etc.) must satisfy.
 *
 * DIP / ISP (post-refactor):
 *   - Pre-refactor: the engine had to `resolver as IPlanChildrenResolver &
 *     { resolveSubPlanFrontmatter?: ... }` because the interface only
 *     declared `resolveOne`; LSP was broken by a cast. Now the
 *     contract declares both methods, so callers and the engine share
 *     a single type without duck typing.
 *   - Pre-refactor: own-slice status leaked into the caller (the close
 *     tool built a wrapper around `resolveOne` to inject the slice map
 *     read from disk). Now the resolver owns that read; the caller
 *     just constructs the resolver and forgets about slices.
 *
 * Implementation classes:
 *   - `buildInMemoryResolver` — `plan-closure.resolvers.ts` (tests)
 *   - `buildDiskPlanChildrenResolver` — same file (real tools)
 */

import type { IProposalFrontmatter } from '../proposals/proposal-document';
import type { IPlanChildKind, IPlanChildSnapshot } from './plan-closure.types';

// ---------------------------------------------------------------------------
// Public contract (the "strategy" in the strategy pattern).
// ---------------------------------------------------------------------------

/**
 * Resolves the live state of one child of a plan. Implementations MUST:
 *   - Return a fresh snapshot per call (no aliasing).
 *   - Never throw on a missing child — return a snapshot with
 *     `status: 'unknown'` instead. The engine treats `unknown` as
 *     not-done, surfacing the blocker cleanly. Throwing would force
 *     the engine into a try/catch that hides the real reason.
 *   - Implement `resolveSubPlanFrontmatter` for every `kind === 'plan'`
 *     ref the engine passes. The real disk resolver parses the
 *     markdown; the in-memory resolver looks up a pre-registered
 *     synthetic frontmatter.
 */
export interface IPlanChildrenResolver {
	/**
	 * Resolve one child by ref + kind.
	 *
	 *   - `kind: 'proposal'` → return the proposal's status + peer-review
	 *     state from the index (or your store of choice).
	 *   - `kind: 'plan'`     → return the sub-plan's status (peer-review
	 *     defaults to `true`; the engine recurses separately).
	 *   - `kind: 'slice'`    → return the slice's status. For a plan's
	 *     own slices the disk resolver reads the plan's `## Slices`
	 *     block on disk; for in-memory the caller pre-registers a Map.
	 */
	resolveOne(ref: string, kind: IPlanChildKind): Promise<IPlanChildSnapshot>;

	/**
	 * Resolve the **frontmatter** of a sub-plan so the engine can
	 * recurse into its own `contains.*` + `closureGate` blocks. Only
	 * called for `kind === 'plan'` refs. Throwing here is acceptable
	 * (a sub-plan whose file is unreadable is a hard error, not a
	 * blocker — different semantics from "child status unknown").
	 */
	resolveSubPlanFrontmatter(ref: string): Promise<IProposalFrontmatter>;
}

/**
 * Composition helper for resolvers that want to layer extra behaviour
 * on top of a base resolver (e.g. close-plan tool layering own-slice
 * status on a disk resolver). Implements the **decorator pattern**:
 * the returned object IS-A `IPlanChildrenResolver`, no casts needed.
 *
 * Usage:
 *   const base = await buildDiskPlanChildrenResolver({...});
 *   const decorated = withOwnSlices(base, ownSlicesMap);
 */
export const withOwnSlices = (
	base: IPlanChildrenResolver,
	ownSlices: ReadonlyMap<string, string>,
): IPlanChildrenResolver => ({
	resolveOne: async (ref, kind) => {
		if (kind === 'slice' && ownSlices.has(ref)) {
			return {
				ref,
				kind,
				status: ownSlices.get(ref) ?? 'unknown',
				peerReviewed: true,
			};
		}
		return base.resolveOne(ref, kind);
	},
	resolveSubPlanFrontmatter: (ref) => base.resolveSubPlanFrontmatter(ref),
});
