/**
 * apply-desired-state.ts — writes the desired configuration back to the
 * forge, and is careful to claim nothing more than that.
 *
 * Two guards sit in front of every write. The policy must say `enforced`
 * (an `observed` policy reports drift and never touches the forge), and
 * the adapter must itself permit mutations, so a broker wired up for
 * inspection cannot be talked into writing by a caller. Both are checked
 * here rather than inside each adapter, so a future GitLab adapter cannot
 * forget one.
 *
 * The result of this file is explicitly NOT a verdict. Writes are grouped
 * per target because forge protection APIs replace a rule wholesale, and
 * a successful write only means the request was accepted — whether the
 * setting actually took is `verify-desired-state.ts`'s job.
 */

import type {
	IGovernanceApplyAction,
	IGovernanceApplyResult,
	IGovernanceDiff,
} from './diff-contracts';
import {
	branchPropertyId,
	BRANCH_PROPERTIES,
	type IDesiredForgeState,
	type IForgeRepositoryRef,
	REPOSITORY_PROPERTIES,
	repositoryPropertyId,
} from './governance-contracts';
import type { IForgeProviderAdapter } from './provider-contracts';
import { safeProviderMessage } from './redact-secrets';

/** Inputs to `applyDesiredState`. */
export interface IApplyInput {
	readonly adapter: IForgeProviderAdapter;
	readonly desired: IDesiredForgeState;
	readonly target: IForgeRepositoryRef;
	/**
	 * The diff to reconcile. When omitted every governed target is
	 * written — used for a first-time bootstrap where nothing was
	 * readable and therefore nothing could be diffed.
	 */
	readonly diff?: IGovernanceDiff;
}

/** Property ids of a scope that are applicable and not already passing. */
const unsatisfied = (
	diff: IGovernanceDiff | undefined,
	ids: readonly string[],
): readonly string[] => {
	if (diff === undefined) return ids;
	const wanted = new Set(ids);
	return diff.properties
		.filter(
			(property) =>
				wanted.has(property.id) &&
				property.applicable &&
				property.status !== 'PASS',
		)
		.map((property) => property.id);
};

const skipped = (
	input: IApplyInput,
	reason: string,
): IGovernanceApplyResult => ({
	provider: input.adapter.provider,
	target: input.target,
	attempted: false,
	actions: [],
	skippedReason: reason,
});

/**
 * Reconcile the forge with the desired state. Never throws; an adapter
 * failure becomes a failed action with a redacted reason.
 */
export const applyDesiredState = async (
	input: IApplyInput,
): Promise<IGovernanceApplyResult> => {
	if (!input.desired.enforced) {
		return skipped(
			input,
			"Policy governance strategy is not 'enforced'; drift is reported, never written.",
		);
	}
	if (!input.adapter.mutationsEnabled) {
		return skipped(
			input,
			'The provider adapter is configured read-only; no forge setting was written.',
		);
	}

	const actions: IGovernanceApplyAction[] = [];

	const repositoryIds = unsatisfied(
		input.diff,
		REPOSITORY_PROPERTIES.map(repositoryPropertyId),
	);
	if (repositoryIds.length > 0) {
		const outcome = await input.adapter.applyRepositorySettings({
			target: input.target,
			settings: input.desired.repository,
		});
		actions.push({
			scope: 'repository',
			ok: outcome.ok,
			properties: repositoryIds,
			reason: outcome.ok ? '' : safeProviderMessage(outcome.reason),
		});
	}

	for (const rule of input.desired.branches) {
		const branchIds = unsatisfied(
			input.diff,
			BRANCH_PROPERTIES.map((property) =>
				branchPropertyId(rule.branch, property),
			),
		);
		if (branchIds.length === 0) continue;
		const outcome = await input.adapter.applyBranchRule({
			target: input.target,
			rule,
		});
		actions.push({
			scope: 'branch',
			branch: rule.branch,
			ok: outcome.ok,
			properties: branchIds,
			reason: outcome.ok ? '' : safeProviderMessage(outcome.reason),
		});
	}

	return {
		provider: input.adapter.provider,
		target: input.target,
		attempted: true,
		actions,
		skippedReason: '',
	};
};
