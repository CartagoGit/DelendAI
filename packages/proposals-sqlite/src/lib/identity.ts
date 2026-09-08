import type { IParsedProposalMarkdown } from './markdown-parser';

export interface IResolvedProposalIdentity {
	readonly uid: string;
	readonly slug: string;
}

export interface IQuarantinedProposalIdentity {
	readonly reason: 'missing-frontmatter-id';
	readonly path: string;
}

export const slugFromUid = (uid: string): string => uid.trim().toLowerCase();

export const resolveProposalIdentity = (
	parsed: IParsedProposalMarkdown
): IResolvedProposalIdentity | IQuarantinedProposalIdentity => {
	const id = parsed.frontmatter.id;
	if (typeof id !== 'string' || id.trim() === '') {
		return {
			reason: 'missing-frontmatter-id',
			path: parsed.path,
		};
	}
	const uid = id.trim();
	return { uid, slug: slugFromUid(uid) };
};

/**
 * Plan / slice identity (x00528 S1).
 *
 * A plan is the execution view of exactly one proposal, so it reuses
 * the proposal uid verbatim. A slice is namespaced under its proposal
 * with a dot: `<proposalUid>.<sliceId>`. `plugins/proposals`
 * (`buildSqlLifecycleReaders`) already assumes this convention, so it
 * must stay stable.
 */
export const planUidForProposal = (proposalUid: string): string =>
	proposalUid.trim();

export const sliceUid = (proposalUid: string, sliceId: string): string =>
	`${proposalUid.trim()}.${sliceId.trim()}`;
