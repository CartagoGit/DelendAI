/**
 * A reviewer gave a claim back because it could not verify the work (its
 * gate could not run, a tool was missing). No verdict: nothing for the
 * implementer to change, and nothing that counts as an approval.
 */
export interface IPeerReviewUnverifiedLogEntry {
	readonly kind: 'unverified';
	readonly ts: string;
	readonly proposalId: string;
	readonly reviewer: string;
	readonly reason: string;
}
