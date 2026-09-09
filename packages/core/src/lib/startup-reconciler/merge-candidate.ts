/**
 * merge-candidate.ts — the one place a checkpoint is promoted from
 * "durability" to "merge candidate".
 *
 * WHY it needs its own module: the schema (migration 0016) enforces
 * `CHECK (checkpoint_kind = 'merge-candidate' OR integrated_sha IS NULL)`.
 * A boot that discovers a checkpoint is already merged — from a merged
 * pull request, or from the commit being contained in the integration
 * branch — must therefore promote the row BEFORE it records the merge, or
 * the write is rejected by SQLite. Two phases discover that fact
 * independently, and having them each remember the ordering is how one of
 * them eventually forgets.
 *
 * The promotion re-records the row from ITS OWN stored fields, so it
 * costs no git and no forge call: a warm boot that skipped re-reading the
 * ref can still record a merge that happened while the machine was off.
 */

import type { IStartupGenerationsPort } from './state-ports';

/**
 * Ensure the checkpoint may carry an integrated SHA. Returns false when
 * the row does not exist — the caller then records nothing rather than
 * inventing a checkpoint to hang the merge on.
 */
export const ensureMergeCandidate = (
	generations: IStartupGenerationsPort,
	target: { readonly workUnitId: number; readonly generation: number },
	now: number,
): boolean => {
	const existing = generations.get(target.workUnitId, target.generation);
	if (existing === null) return false;
	if (existing.checkpointKind === 'merge-candidate') return true;
	generations.record({
		workUnitId: existing.workUnitId,
		generation: existing.generation,
		baseIntegrationSha: existing.baseIntegrationSha,
		wipRef: existing.wipRef,
		wipHeadSha: existing.wipHeadSha,
		patchDigest: existing.patchDigest,
		fileScope: existing.fileScope,
		checkpointKind: 'merge-candidate',
		authorAgentId: existing.authorAgentId,
		machineId: existing.machineId,
		now,
	});
	return true;
};
