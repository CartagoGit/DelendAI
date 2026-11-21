/**
 * unit-heartbeat.service.ts — which units have gone quiet.
 *
 * WHY: a worktree's session stamp outlives its owner. A fixer re-entering a
 * unit was refused "held by a live lease" because the stamp was still there
 * and the finished worker's server process was still running. Only the
 * lease heartbeat inside the idle window says a unit has an editor.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IUnitLease } from './unit-lease.interface';
import { gitCommonDirOf } from './unit-lease.service';
import { listUnitLeases } from './unit-lease.store';
import { leaseWindowSeconds } from './unit-verdict.service';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Whether the lease beat inside the window and its owner did not say it ran out of quota since. */
export const isBeating = (
	lease: IUnitLease | undefined,
	now: number,
	windowSeconds: number,
): boolean => {
	if (lease === undefined) return false;
	const quota = lease.outOfQuotaAt;
	if (quota !== undefined && quota >= lease.heartbeatAt) return false;
	return Math.max(0, now - lease.heartbeatAt) <= windowSeconds;
};

/**
 * The short refs of the units whose lease exists and is not beating. A unit
 * with no lease yet is mid-entry (its owner records the lease just after
 * the entry returns), so it is not quiet.
 */
export const quietUnitRefs = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	now: number = nowSeconds(),
): Promise<ReadonlySet<string>> => {
	const common = gitCommonDirOf(root);
	if (common === undefined) return new Set();
	const window = leaseWindowSeconds(policy.coordination.leaseTtlMinutes);
	return new Set(
		[...(await listUnitLeases(common)).entries()]
			.filter(([, lease]) => !isBeating(lease, now, window))
			.map(([ref]) => ref),
	);
};

/** The short branch name a lease is keyed by. */
export const shortBranch = (ref: string): string =>
	ref.replace(/^refs\/heads\//u, '');
