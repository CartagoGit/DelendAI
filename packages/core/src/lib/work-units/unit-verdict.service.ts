/**
 * unit-verdict.service.ts — the one answer to "whose is this unit, and is
 * anybody still on it".
 *
 * WHY one function: ref-lifecycle, `reclaim:orphans`, `work status`, the
 * overview and `work retire` each guessed from a branch's commit counts,
 * and a branch that is ahead of the integration branch looks the same
 * whether a session is typing in it or a rate limit killed that session an
 * hour ago. Only a heartbeat tells them apart.
 */
import {
	ABANDONED_AFTER_LEASE_WINDOWS,
	DEFAULT_UNIT_LEASE_TTL_MINUTES,
	SECONDS_PER_MINUTE,
} from './unit-lease.constant';
import type { IUnitEvidence, IUnitVerdict } from './unit-lease.interface';

/** The lease window the policy declares, with a default for "never". */
export const leaseWindowSeconds = (leaseTtlMinutes: number): number =>
	(leaseTtlMinutes > 0 ? leaseTtlMinutes : DEFAULT_UNIT_LEASE_TTL_MINUTES) *
	SECONDS_PER_MINUTE;

const minutes = (seconds: number): string =>
	`${String(Math.max(0, Math.round(seconds / SECONDS_PER_MINUTE)))} min`;

export const judgeUnit = (evidence: IUnitEvidence): IUnitVerdict => {
	const owner = evidence.lease?.owner ?? null;
	const heartbeat = evidence.lease?.heartbeatAt ?? evidence.tipAt;
	const silentSeconds =
		heartbeat === undefined ? null : Math.max(0, evidence.now - heartbeat);
	// A delivered tip is not yet the end of a branch whose owner is still
	// on it: a proposal in progress publishes slice after slice from one
	// work ref, and its owner may be about to commit the next one.
	const stillShowingLife =
		silentSeconds !== null && silentSeconds <= evidence.windowSeconds;
	if (evidence.delivered && !stillShowingLife) {
		if (
			evidence.proposalInProgress === true &&
			evidence.claimedByOther !== true
		) {
			return {
				standing: 'idle',
				owner,
				silentSeconds,
				reason: 'its work landed but its proposal is still in progress: hand it off to review or continue it; it is reaped once the proposal leaves in-progress',
			};
		}
		const reapAfter =
			evidence.windowSeconds * ABANDONED_AFTER_LEASE_WINDOWS;
		if (
			evidence.keptForContinuation === true &&
			evidence.claimedByOther !== true &&
			silentSeconds !== null &&
			silentSeconds <= reapAfter
		) {
			return {
				standing: 'idle',
				owner,
				silentSeconds,
				reason: `published and kept for the next slices of its proposal; it is reaped after ${minutes(reapAfter)} of silence, or once another agent takes the proposal`,
			};
		}
		return {
			standing: 'delivered',
			owner,
			silentSeconds,
			reason:
				evidence.keptForContinuation === true
					? 'published and kept for continuation, but nobody continued it: the publication holds everything'
					: 'its work is already in the integration branch or a publication, and its owner has gone quiet',
		};
	}
	if (silentSeconds === null) {
		return {
			standing: 'idle',
			owner,
			silentSeconds,
			reason: 'no heartbeat and no commit to date it from: not judged abandoned without evidence',
		};
	}
	const source =
		evidence.lease === undefined
			? 'its last commit (it predates leases)'
			: `the heartbeat of ${evidence.lease.owner.agent}`;
	if (silentSeconds <= evidence.windowSeconds) {
		return {
			standing: 'live',
			owner,
			silentSeconds,
			reason: `${source} is ${minutes(silentSeconds)} old, inside the ${minutes(evidence.windowSeconds)} window`,
		};
	}
	if (
		silentSeconds <=
		evidence.windowSeconds * ABANDONED_AFTER_LEASE_WINDOWS
	) {
		return {
			standing: 'idle',
			owner,
			silentSeconds,
			reason: `${source} is ${minutes(silentSeconds)} old: quiet, so it is listed for adoption, not for removal`,
		};
	}
	return {
		standing: 'abandoned',
		owner,
		silentSeconds,
		reason: `${source} is ${minutes(silentSeconds)} old, past ${String(ABANDONED_AFTER_LEASE_WINDOWS)} lease windows: its owner is gone`,
	};
};
