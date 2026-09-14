/**
 * local-merge-gate.ts — whether a work ref may land on the integration
 * branch WITHOUT a pull request, for the forges a project does not
 * administer.
 *
 * WHY IT EXISTS: `policy-gate.ts` correctly declines every strategy that
 * is not `pull-request` — the pull-request engine says "not mine". But
 * nothing then said "mine", so a project on `shared-checkout-merge`
 * checkpointed its work to a ref and no path ever integrated it. The
 * model was declarable and not runnable.
 *
 * WHAT DOES NOT CHANGE: the invariant the pull-request path is built
 * around. A candidate certified against integration head `A` must not
 * land once the head is `A+X` — two independently-green units can
 * combine into a red branch, and nothing about "both were green"
 * implies "both are green in sequence". A forge with no review object
 * does not make that any less true; it only removes the thing that was
 * checking it, which is exactly why `requiresLocalCertification` is
 * true for this strategy.
 *
 * WHAT REPLACES THE FORGE: the certification is produced here and
 * carries the head it was produced against, so the comparison this gate
 * makes is the same comparison the forge was making — just with
 * evidence this side can see. Absent certification is refused, never
 * assumed: a forge that cannot require a check is a reason to check
 * harder, not a reason to stop.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type {
	ILocalMergeInput,
	ILocalMergeVerdict,
} from './local-merge-gate.interface';

export type {
	ILocalCertification,
	ILocalMergeDecision,
	ILocalMergeInput,
	ILocalMergeVerdict,
} from './local-merge-gate.interface';

/** Whether this policy integrates by merging rather than by review. */
export const gateLocalMerge = (
	policy: IResolvedDevelopmentPolicy,
): ILocalMergeVerdict | undefined =>
	policy.integration.strategy === 'merge'
		? undefined
		: {
				decision: 'refuse',
				reason: `integration.strategy is '${policy.integration.strategy}', so this project does not integrate by local merge; the merge engine declines.`,
			};

/**
 * The decision, from the policy and the facts.
 *
 * Ordered so that every reason to NOT land is exhausted before landing
 * is reachable, and so the two non-merge outcomes stay distinguishable:
 * `refuse` is somebody's mistake, `revalidate` is merely a question
 * nobody has answered against the current head yet.
 */
export const planLocalMerge = (
	policy: IResolvedDevelopmentPolicy,
	input: ILocalMergeInput,
): ILocalMergeVerdict => {
	const declined = gateLocalMerge(policy);
	if (declined !== undefined) return declined;

	if (policy.integration.requiresLocalCertification) {
		const certification = input.certification;
		if (certification === undefined) {
			return {
				decision: 'refuse',
				reason: `${input.workRef} carries no certification, and this strategy has no forge check to fall back on. Nothing has established that it is green.`,
			};
		}
		if (!certification.passed) {
			return {
				decision: 'refuse',
				reason: `${input.workRef} was certified and did not pass.`,
			};
		}
		// The head it was certified against is the whole point of
		// recording it: a pass is a statement about a pair, not about a
		// commit.
		if (certification.againstIntegrationSha !== input.integrationSha) {
			return {
				decision: 'revalidate',
				reason: `${input.workRef} was certified against ${certification.againstIntegrationSha.slice(0, 8)} and the integration branch is now at ${input.integrationSha.slice(0, 8)}. The verdict describes a state that no longer exists.`,
			};
		}
	}

	if (
		policy.integration.requireLatestIntegration &&
		!input.builtOnIntegrationHead
	) {
		return {
			decision: 'revalidate',
			reason: `${input.workRef} is not built on ${input.integrationSha.slice(0, 8)}; replay it onto the current head before it can land.`,
		};
	}

	return {
		decision: 'merge',
		reason: `${input.workRef} is certified against the current integration head and may land.`,
		mergeMethod: policy.integration.mergeMethod,
	};
};
