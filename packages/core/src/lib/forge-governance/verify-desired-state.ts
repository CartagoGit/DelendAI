/**
 * verify-desired-state.ts — RE-READS the forge after a write and decides
 * whether the desired state is actually in force.
 *
 * Applying is not verifying. A forge can accept a protection payload and
 * silently normalise it, drop a field its plan does not support, or apply
 * it to a branch that does not exist yet; an "apply succeeded" log line in
 * that situation is exactly the green-looking lie this subsystem exists
 * to prevent. So the verdict a gate consumes may only ever come from a
 * fresh read taken after the write, compared property by property.
 *
 * A property that was written and then reads back differently — or reads
 * back not at all — is a REGRESSION and is surfaced separately from
 * ordinary drift, because it means the forge did not do what it said.
 */

import type {
	IGovernanceApplyResult,
	IGovernanceVerification,
} from './diff-contracts';
import { isPassingVerdict } from './diff-contracts';
import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts';
import { inspectDesiredVsLive } from './inspect-desired-vs-live';
import type { IForgeProviderAdapter } from './provider-contracts';

/** Inputs to `verifyDesiredState`. */
export interface IVerifyInput {
	readonly adapter: IForgeProviderAdapter;
	readonly desired: IDesiredForgeState;
	readonly target: IForgeRepositoryRef;
	/** The apply whose effect is being verified, when there was one. */
	readonly applied?: IGovernanceApplyResult;
}

/** Property ids a successful write claimed to have reconciled. */
const claimedProperties = (
	applied: IGovernanceApplyResult | undefined,
): ReadonlySet<string> => {
	const ids = new Set<string>();
	for (const action of applied?.actions ?? []) {
		if (!action.ok) continue;
		for (const id of action.properties) ids.add(id);
	}
	return ids;
};

/**
 * Re-read the live state and confirm it matches. The returned `verdict`
 * is the only value a gate may trust, and `passed` is true for `PASS`
 * alone — `NOT_EXECUTABLE` is a failure, always.
 */
export const verifyDesiredState = async (
	input: IVerifyInput,
): Promise<IGovernanceVerification> => {
	const live = await input.adapter.readLiveState({
		target: input.target,
		branches: input.desired.branches.map((rule) => rule.branch),
	});
	const diff = inspectDesiredVsLive({
		desired: input.desired,
		live,
		target: input.target,
	});
	const claimed = claimedProperties(input.applied);
	const regressions = diff.properties
		.filter(
			(property) =>
				property.applicable &&
				property.status !== 'PASS' &&
				claimed.has(property.id),
		)
		.map((property) => property.id);
	return {
		verdict: diff.verdict,
		passed: isPassingVerdict(diff.verdict),
		diff,
		regressions,
	};
};
