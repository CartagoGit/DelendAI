/**
 * plan-closure.engine.ts
 *
 * The pure engine: `evaluatePlanClosure(planId, frontmatter, resolver,
 * policy?)` → `IPlanClosureReport`. No I/O, no disk, no resolver
 * construction. The engine consumes the strategy interface
 * (`IPlanChildrenResolver`) and the policy value object
 * (`IPlanClosureGatePolicy`); everything else is internal.
 *
 * Why a separate engine (OCP + DIP):
 *   - Pre-refactor: the engine read frontmatter flags directly,
 *     hardcoded the three checks in `walk`, and knew about the
 *     resolver's optional `resolveSubPlanFrontmatter` via a cast.
 *   - Post-refactor: the engine is parameterised over the policy and
 *     the typed resolver. New checks (e.g. "requireSlicesAcceptedByA
 *     DifferentAgent") can be added by extending the policy type, not
 *     by editing the walker.
 *
 * Recursion:
 *   - The walker carries a `visited: Set<string>` seeded with the
 *     top-level `planId`. If a sub-plan reference is already in the
 *     set, the walker surfaces a `self-cycle` blocker and stops
 *     descending (defence against q00001 → q00002 → q00001).
 *   - A `maxDepth` cap (default 16) provides defence in depth.
 *
 * Pure: no I/O, no Date.now, no Math.random, no logging. The only
 * side effect is the `Set` mutation for `visited`, which is encapsulated
 * in the walker arguments.
 */

import type { IProposalFrontmatter } from '../proposals/proposal-document';
import type { IPlanChildrenResolver } from './plan-closure.strategy';
import {
	DEFAULT_CLOSURE_GATE_POLICY,
	policyFromFrontmatter,
} from './plan-closure.types';
import type {
	IPlanChildSnapshot,
	IPlanClosureGatePolicy,
	IPlanClosureReason,
	IPlanClosureReport,
} from './plan-closure.types';

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export interface IEvaluatePlanClosureOptions {
	readonly planId: string;
	readonly frontmatter: IProposalFrontmatter;
	readonly resolver: IPlanChildrenResolver;
	/**
	 * Optional override for the closure policy. When absent, the
	 * engine derives it from `frontmatter.closureGate` (with defaults).
	 * Tests pass an explicit policy; production code lets the engine
	 * read the frontmatter to keep the call site one argument shorter.
	 */
	readonly policy?: IPlanClosureGatePolicy;
	/**
	 * Override recursion cap. Default 16. Even with `visited`-based
	 * cycle detection, a host that expects very deep plans can raise
	 * the cap. A plan that legitimately needs depth > 16 is almost
	 * certainly modelling something the resolver cannot handle — the
	 * cap is a sanity rail, not a feature.
	 */
	readonly maxDepth?: number;
}

export const DEFAULT_MAX_DEPTH = 16;

/**
 * Recursively evaluate whether a plan can be closed. Returns a structured
 * report — never throws. Cycle detection is defensive (`visited` set);
 * the report surfaces a `self-cycle` reason instead of infinite-looping.
 */
export const evaluatePlanClosure = async (
	options: IEvaluatePlanClosureOptions,
): Promise<IPlanClosureReport> => {
	const policy = options.policy ?? policyFromFrontmatter(options.frontmatter);
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	const visited = new Set<string>([options.planId]);
	return walk({
		planId: options.planId,
		frontmatter: options.frontmatter,
		resolver: options.resolver,
		policy,
		visited,
		depth: 1,
		maxDepth,
	});
};

// ---------------------------------------------------------------------------
// Internal walker — the engine's only mutable surface is the `visited` set.
// ---------------------------------------------------------------------------

interface IWalkArgs {
	readonly planId: string;
	readonly frontmatter: IProposalFrontmatter;
	readonly resolver: IPlanChildrenResolver;
	readonly policy: IPlanClosureGatePolicy;
	readonly visited: Set<string>;
	readonly depth: number;
	readonly maxDepth: number;
}

const walk = async (args: IWalkArgs): Promise<IPlanClosureReport> => {
	const { planId, frontmatter, resolver, policy, visited, depth, maxDepth } =
		args;
	const reasons: IPlanClosureReason[] = [];
	const children: IPlanChildSnapshot[] = [];

	await evaluateProposals(frontmatter, resolver, policy, children, reasons);
	await evaluateSubPlans(
		planId,
		frontmatter,
		resolver,
		policy,
		visited,
		depth,
		maxDepth,
		children,
		reasons,
	);
	await evaluateOwnSlices(frontmatter, resolver, policy, children, reasons);

	return {
		planId,
		closable: reasons.length === 0,
		reasons,
		children,
		depth,
	};
};

// ---------------------------------------------------------------------------
// Phase 1 — Contained proposals (no recursion).
// ---------------------------------------------------------------------------

const evaluateProposals = async (
	frontmatter: IProposalFrontmatter,
	resolver: IPlanChildrenResolver,
	policy: IPlanClosureGatePolicy,
	children: IPlanChildSnapshot[],
	reasons: IPlanClosureReason[],
): Promise<void> => {
	const list = frontmatter.contains?.proposals ?? [];
	for (const entry of list) {
		const id = entry.id;
		if (id.length === 0) continue;
		const snap = await resolver.resolveOne(id, 'proposal');
		children.push(snap);
		if (policy.requireAllChildrenDone && snap.status !== 'done') {
			reasons.push({
				ref: id,
				kind: 'proposal',
				code: 'not-done',
				message: `Proposal ${id} is '${snap.status}', expected 'done'`,
			});
		}
		if (policy.requirePeerReview && !snap.peerReviewed) {
			reasons.push({
				ref: id,
				kind: 'proposal',
				code: 'not-peer-reviewed',
				message: `Proposal ${id} is not peer-reviewed`,
			});
		}
	}
};

// ---------------------------------------------------------------------------
// Phase 2 — Contained sub-plans (recursive, with cycle + depth guards).
// ---------------------------------------------------------------------------

const evaluateSubPlans = async (
	planId: string,
	frontmatter: IProposalFrontmatter,
	resolver: IPlanChildrenResolver,
	policy: IPlanClosureGatePolicy,
	visited: Set<string>,
	depth: number,
	maxDepth: number,
	children: IPlanChildSnapshot[],
	reasons: IPlanClosureReason[],
): Promise<void> => {
	const list = frontmatter.contains?.plans ?? [];
	for (const entry of list) {
		const id = entry.id;
		if (id.length === 0) continue;
		if (visited.has(id)) {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'self-cycle',
				message: `Plan cycle detected: ${planId} → ${id} already visited`,
			});
			continue;
		}
		if (depth >= maxDepth) {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'self-cycle',
				message: `Max recursion depth (${maxDepth}) reached at ${id}`,
			});
			continue;
		}
		const snap = await resolver.resolveOne(id, 'plan');
		children.push(snap);
		if (policy.requireAllChildrenDone && snap.status !== 'done') {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'not-done',
				message: `Sub-plan ${id} is '${snap.status}', expected 'done'`,
			});
		}
		const subFrontmatter = await resolver.resolveSubPlanFrontmatter(id);
		visited.add(id);
		const subReport = await walk({
			planId: id,
			frontmatter: subFrontmatter,
			resolver,
			policy,
			visited,
			depth: depth + 1,
			maxDepth,
		});
		visited.delete(id);
		reasons.push(...subReport.reasons);
		children.push(...subReport.children);
	}
};

// ---------------------------------------------------------------------------
// Phase 3 — Plan's own `## Slices` (referenced from `contains.slices`).
// ---------------------------------------------------------------------------

const evaluateOwnSlices = async (
	frontmatter: IProposalFrontmatter,
	resolver: IPlanChildrenResolver,
	policy: IPlanClosureGatePolicy,
	children: IPlanChildSnapshot[],
	reasons: IPlanClosureReason[],
): Promise<void> => {
	if (!policy.requireAllSlicesDone) return;
	const list = frontmatter.contains?.slices ?? [];
	for (const entry of list) {
		const id = entry.id;
		if (id.length === 0) continue;
		const snap = await resolver.resolveOne(id, 'slice');
		children.push(snap);
		if (snap.status !== 'done') {
			reasons.push({
				ref: id,
				kind: 'slice',
				code: 'not-done',
				message: `Own slice ${id} is '${snap.status}', expected 'done'`,
			});
		}
	}
};

// Re-export the default policy for callers that want to compose their own.
export { DEFAULT_CLOSURE_GATE_POLICY };
