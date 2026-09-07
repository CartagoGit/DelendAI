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
