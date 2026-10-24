/**
 * Contract shapes for `./leases-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `leases-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `leases-repo.ts`, so no import site changes.
 */

export type ILeaseExpireOutcome =
	| { readonly kind: 'expired'; readonly lease: ILeaseRecord }
	| { readonly kind: 'not_expirable'; readonly lease: ILeaseRecord }
	| { readonly kind: 'unknown_lease' };

export interface ILeaseRecord {
	readonly id: string;
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly processId: number | null;
	readonly sessionId: string | null;
	readonly acquiredAt: number;
	readonly heartbeatAt: number;
	readonly expiresAt: number;
	readonly releasedAt: number | null;
}

export interface IAcquireLeaseArgs {
	readonly id: string;
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly processId?: number | undefined;
	readonly sessionId?: string | undefined;
	readonly acquiredAt: number;
	readonly ttlMs: number;
}
