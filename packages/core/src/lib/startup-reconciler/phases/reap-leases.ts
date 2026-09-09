/**
 * reap-leases.ts — phase 8: the locks of a machine that is not here.
 *
 * The scenario this phase exists for is the whole point of the product:
 * the laptop held leases and claims when it was closed. Those rows say
 * "an agent on machine A is writing these paths right now", and machine A
 * is not running. Left alone, they lock the office machine out of its own
 * work; resurrected, they hand write authority to a process that does not
 * exist.
 *
 * So an elapsed lease is reaped (SAFE: the TTL is the operator's own
 * statement of when an un-renewed lease is dead), its claims are
 * released, and the work it owned becomes RECOVERABLE — a state, not a
 * deletion. `recovery.neverDiscardUnmergedWork` is not a preference here:
 * nothing in this file can delete a work unit, a generation or a ref.
 *
 * The ambiguous cousin is two LIVE owners holding the same path. That is
 * not a stale lock, it is a contradiction about who may write, and no
 * automatic choice is defensible — it degrades the boot instead.
 */

import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IStartupStatePorts } from '../state-ports';

/** What phase 8 produced. */
export interface ILeasePhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly leasesExpired: number;
		readonly claimsReleased: number;
		readonly workUnitsRecoverable: number;
	};
}

/** States that must never be reopened as recoverable. */
const TERMINAL = new Set(['integrated', 'deprecated']);

export const runLeasePhase = (input: {
	readonly ports: IStartupStatePorts;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly repositoryId: number;
	readonly repositoryUid: string;
	readonly machineId: string;
	readonly agentId: string;
	readonly now: number;
}): ILeasePhaseResult => {
	const findings: IStartupFinding[] = [];
	if (input.policy.coordination.strategy === 'none') {
		return {
			findings,
			counters: {
				leasesExpired: 0,
				claimsReleased: 0,
				workUnitsRecoverable: 0,
			},
		};
	}

	const expired = input.ports.leases.listExpired(input.now);
	const abandonedOwners = new Set<string>();
	let leasesExpired = 0;
	for (const lease of expired) {
		const outcome = input.ports.leases.expire(lease.id, input.now);
		if (outcome.kind !== 'expired') continue;
		leasesExpired += 1;
		abandonedOwners.add(lease.ownerAgentId);
		findings.push(
			finding({
				code: 'leases.expired-reaped',
				phase: 'leases',
				kind: 'repaired',
				subject: lease.id,
				message: `Lease ${lease.id} held by ${lease.ownerAgentId} on machine ${lease.machineId} expired at ${String(lease.expiresAt)} and was reaped.`,
			}),
		);
	}

	const claimsReleased = input.ports.claims.releaseClaimsOfExpiredLeases(
		input.now,
	);
	if (claimsReleased > 0) {
		findings.push(
			finding({
				code: 'leases.claims-released',
				phase: 'leases',
				kind: 'repaired',
				subject: 'claims',
				message: `Released ${String(claimsReleased)} path claim(s) whose lease had expired.`,
			}),
		);
	}

	let workUnitsRecoverable = 0;
	if (input.policy.recovery.resumeExistingWork) {
		for (const unit of input.ports.workUnits.listForRepository(
			input.repositoryId,
		)) {
			const owner = unit.currentOwnerAgentId;
			if (owner === null || !abandonedOwners.has(owner)) continue;
			if (TERMINAL.has(unit.state) || unit.state === 'recoverable') {
				continue;
			}
			const updated = input.ports.workUnits.markRecoverable(
				unit.uid,
				input.now,
			);
			if (updated === null) continue;
			workUnitsRecoverable += 1;
			findings.push(
				finding({
					code: 'leases.work-recoverable',
					phase: 'leases',
					kind: 'repaired',
					subject: unit.uid,
					message: `The owner of ${unit.uid} disappeared with its lease; the work is RECOVERABLE and was NOT deleted.`,
				}),
			);
			// Deterministic `occurredAt` (the moment the lease died, not
			// the moment we noticed) so re-observing the same recovery
			// replays as the same journal event rather than a new one.
			input.ports.journal.append({
				eventKind: 'slice-recovered',
				repositoryUid: input.repositoryUid,
				workUnitUid: unit.uid,
				actorAgentId: input.agentId,
				machineId: input.machineId,
				occurredAt: input.now,
				payload: {
					previousOwner: owner,
					reason: 'lease-expired',
				},
			});
		}
	}

	// Two live owners on one path: a contradiction, not a stale lock.
	const byPath = new Map<string, Set<string>>();
	for (const claim of input.ports.claims.listActive(input.repositoryId)) {
		const owners = byPath.get(claim.path) ?? new Set<string>();
		owners.add(claim.ownerAgentId);
		byPath.set(claim.path, owners);
	}
	for (const [path, owners] of byPath) {
		if (owners.size < 2) continue;
		findings.push(
			finding({
				code: 'leases.overlapping-owners',
				phase: 'leases',
				kind: 'blocker',
				subject: path,
				message: `${String(owners.size)} live owners claim ${path} (${[...owners].sort().join(', ')}). No owner was chosen and no claim was released.`,
			}),
		);
	}

	return {
		findings,
		counters: { leasesExpired, claimsReleased, workUnitsRecoverable },
	};
};
