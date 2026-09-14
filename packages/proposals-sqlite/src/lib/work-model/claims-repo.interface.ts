/**
 * Contract shapes for `./claims-repo`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `claims-repo.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `claims-repo.ts`, so no import site changes.
 */

export interface IClaimRecord {
	readonly id: number;
	readonly repositoryId: number;
	readonly path: string;
	readonly ownerAgentId: string;
	readonly leaseId: string;
	readonly workUnitId: number;
	readonly generation: number | null;
	readonly claimedAt: number;
	readonly releasedAt: number | null;
}

export interface IClaimPathsArgs {
	readonly repositoryId: number;
	readonly paths: readonly string[];
	readonly ownerAgentId: string;
	readonly leaseId: string;
	readonly workUnitId: number;
	readonly generation?: number | undefined;
	readonly now?: number | undefined;
}

export type IClaimOutcome =
	| { readonly kind: 'claimed'; readonly claims: readonly IClaimRecord[] }
	| {
			readonly kind: 'conflict';
			/** Paths already held by somebody else, sorted. */
			readonly conflicting: readonly string[];
	  };
