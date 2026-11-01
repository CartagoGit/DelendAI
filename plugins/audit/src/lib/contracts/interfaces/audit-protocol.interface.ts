export interface ISeatClaim {
	readonly seat: string;
	readonly reviewer: string;
	readonly claimedAt: string;
}

export type ISeatClaimResult =
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
	readonly missing: string[];
}

export type IInventoryState = 'open' | 'confirmed' | 'rejected' | 'fixed';

export interface IInventoryRow {
	readonly findingId: string;
	readonly source: string;
	readonly state: IInventoryState;
}

export interface IProposalInventoryRow {
	readonly id: string;
	readonly status: string;
	readonly title: string;
}

export interface IFindingConsensus {
	readonly id: string;
	readonly seenBy: string[];
	readonly reviewers: number;
	readonly ratio: number;
	readonly threshold: number;
	readonly consensus: boolean;
}

export interface ICloseToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly defaultAuditDir: string;
	/** Workspace-relative proposals root (`<docsDir>/proposals`). */
	readonly proposalsRoot: string;
}
