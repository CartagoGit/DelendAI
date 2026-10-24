/**
 * policy-gate.ts — decides whether a boot must reconcile at all.
 *
 * WHY a gate exists: reconciliation fetches refs, walks a work-ref
 * namespace and reaps leases. On a project that never produced any of
 * those, all of that work is pure cost with nothing to reconcile — and
 * turning it on for every existing adopter the day they upgrade would be
 * a breaking change dressed up as a bug fix.
 *
 * WHY these two capability booleans and not a profile name: `profile` is
 * sugar (see `development-policy/profiles.ts`) and nothing in the runtime
 * may branch on it. The question the reconciler actually answers is
 * "does durable work live OUTSIDE the checkout, such that a machine that
 * has never seen this workspace has to rebuild its picture of it?".
 * Exactly two resolved capabilities make that true:
 *
 *   - `persistence.usesWipRefs` — work is written into a ref namespace
 *     rather than the visible tree, so refs are the only record of it.
 *   - `recovery.resumeExistingWork` — abandoned work must be FOUND and
 *     re-owned, which is a query over that same durable record.
 *
 * `direct-commit` + `recovery: none` (the historical `shared-direct`
 * model) makes both false: every commit is already on the integration
 * branch and nothing is left over to re-derive, so the gate stays shut
 * and that project boots exactly as it did before. `worktree-pr` writes
 * branches rather than wip refs, but still resumes abandoned work, so the
 * second boolean opens the gate for it.
 *
 * Deliberately NOT part of the condition: `coordination.strategy` and
 * `governance.strategy`. A project can hold file locks or observe forge
 * settings without any cross-machine work record to rebuild, and making
 * either of those open the gate would drag `shared-direct` back in.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { IStartupReconciliationGate } from './policy-gate.interface';

export type { IStartupReconciliationGate } from './policy-gate.interface';

export const decideStartupReconciliation = (
	policy: IResolvedDevelopmentPolicy,
): IStartupReconciliationGate => {
	const wipRefs = policy.persistence.usesWipRefs;
	const resumes = policy.recovery.resumeExistingWork;
	if (!wipRefs && !resumes) {
		return {
			required: false,
			reason: 'the resolved development policy keeps no durable work outside the checkout (persistence.usesWipRefs=false, recovery.resumeExistingWork=false), so there is nothing to reconcile at boot',
		};
	}
	const causes = [
		...(wipRefs ? ['persistence.usesWipRefs=true'] : []),
		...(resumes ? ['recovery.resumeExistingWork=true'] : []),
	];
	return {
		required: true,
		reason: `the resolved development policy keeps durable work outside the checkout (${causes.join(', ')})`,
	};
};
