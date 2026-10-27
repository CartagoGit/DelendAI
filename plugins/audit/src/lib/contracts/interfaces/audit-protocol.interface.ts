export interface ISeatClaim {
	readonly seat: string;
	readonly reviewer: string;
	readonly claimedAt: string;
}

export type SeatClaimResult =
	| { readonly ok: true; readonly claim: ISeatClaim }
	| { readonly ok: false; readonly reason: string };

export interface IPhaseACommit {
	readonly reviewer: string;
	readonly file: string;
	readonly sha256: string;
	readonly committedAt: string;
}

export interface IFindingContractReport {
	readonly source: string;
	readonly findingId: string;
	readonly missing: readonly string[];
}

export type InventoryState = 'open' | 'confirmed' | 'rejected' | 'fixed';

export interface IInventoryRow {
	readonly findingId: string;
	readonly source: string;
	readonly state: InventoryState;
}

export interface IProposalInventoryRow {
	readonly id: string;
	readonly status: string;
	readonly title: string;
}

export interface IFindingConsensus {
	readonly id: string;
	readonly seenBy: readonly string[];
	readonly reviewers: number;
	readonly ratio: number;
	readonly threshold: number;
	readonly consensus: boolean;
}
