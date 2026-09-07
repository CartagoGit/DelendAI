import {
	parseProposalMarkdown,
	type IParsedProposalMarkdown,
} from './markdown-parser';
import {
	resolveProposalIdentity,
	type IQuarantinedProposalIdentity,
	type IResolvedProposalIdentity,
} from './identity';
import {
	canonicalProposalCandidates,
	digestProposalCandidates,
} from './repository/digest';

export interface IReconcilerInputFile {
	readonly path: string;
	readonly raw: string;
}

export interface IProposalCandidate {
	readonly uid: string;
	readonly slug: string;
	readonly path: string;
	readonly title: string;
	readonly kind: string | null;
	readonly status: string | null;
	readonly type: string | null;
	readonly track: string | null;
	readonly bodyHash: string;
}

export interface IQuarantineCandidate {
	readonly path: string;
	readonly errorCode: string;
	readonly errorMessage: string;
}

export interface IReconcileResult {
	readonly mode: 'shadow' | 'incremental';
	readonly sourceCommit: string;
	readonly filesSeen: number;
	readonly proposals: readonly IProposalCandidate[];
	readonly quarantined: readonly IQuarantineCandidate[];
	readonly logicalDigest: string;
	readonly status: 'ok' | 'degraded';
}

const toCandidate = (
	identity: IResolvedProposalIdentity,
	parsed: IParsedProposalMarkdown
): IProposalCandidate => ({
	uid: identity.uid,
	slug: identity.slug,
	path: parsed.path,
	title: parsed.title,
	kind:
		typeof parsed.frontmatter.kind === 'string'
			? parsed.frontmatter.kind
			: null,
	status:
		typeof parsed.frontmatter.status === 'string'
			? parsed.frontmatter.status
			: null,
	type:
		typeof parsed.frontmatter.type === 'string'
			? parsed.frontmatter.type
			: null,
	track:
		typeof parsed.frontmatter.track === 'string'
			? parsed.frontmatter.track
			: null,
	bodyHash: parsed.bodyHash,
});

const toQuarantine = (
	identity: IQuarantinedProposalIdentity
): IQuarantineCandidate => ({
	path: identity.path,
	errorCode: identity.reason,
	errorMessage: 'frontmatter.id is required for stable identity',
});

export const reconcileProposalMarkdown = (input: {
	readonly sourceCommit: string;
	readonly files: readonly IReconcilerInputFile[];
	readonly mode: 'shadow' | 'incremental';
}): IReconcileResult => {
	const proposals: IProposalCandidate[] = [];
	const quarantined: IQuarantineCandidate[] = [];
	for (const file of input.files) {
		try {
			const parsed = parseProposalMarkdown(file.path, file.raw);
			const identity = resolveProposalIdentity(parsed);
			if ('reason' in identity) {
				quarantined.push(toQuarantine(identity));
				continue;
			}
			proposals.push(toCandidate(identity, parsed));
		} catch (error) {
			quarantined.push({
				path: file.path,
				errorCode: 'parse_failed',
				errorMessage:
					error instanceof Error ? error.message : String(error),
			});
		}
	}
	const ordered = canonicalProposalCandidates(proposals);
	const logicalDigest = digestProposalCandidates(ordered);
	return {
		mode: input.mode,
		sourceCommit: input.sourceCommit,
		filesSeen: input.files.length,
		proposals: ordered,
		quarantined,
		logicalDigest,
		status: quarantined.length === 0 ? 'ok' : 'degraded',
	};
};
