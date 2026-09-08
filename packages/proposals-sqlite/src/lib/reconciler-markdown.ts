import { createHash } from 'node:crypto';

import {
	parseProposalMarkdown,
	parseSliceSections,
	type IParsedProposalMarkdown,
	type IParsedSliceSection,
} from './markdown-parser';
import {
	planUidForProposal,
	resolveProposalIdentity,
	sliceUid,
	slugFromUid,
	type IQuarantinedProposalIdentity,
	type IResolvedProposalIdentity,
} from './identity';
import { canonicalProposalCandidates } from './repository/digest';
import type { TPlanStatus } from './repository/plans-repo';
import type { TSliceStatus } from './repository/slices-repo';

export interface IReconcilerInputFile {
	readonly path: string;
	readonly raw: string;
	readonly sha?: string;
}

export interface IMarkdownReconcileInput {
	readonly sourceCommit: string;
	readonly files: readonly IReconcilerInputFile[];
	readonly mode: 'shadow' | 'incremental';
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

export interface IPlanCandidate {
	readonly uid: string;
	readonly proposalUid: string;
	readonly slug: string;
	readonly path: string;
	readonly title: string;
	readonly status: TPlanStatus;
}

export interface ISliceCandidate {
	readonly uid: string;
	readonly planUid: string;
	readonly proposalUid: string;
	readonly sliceId: string;
	readonly slug: string;
	readonly path: string;
	readonly title: string;
	readonly status: TSliceStatus;
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
	readonly plans: readonly IPlanCandidate[];
	readonly slices: readonly ISliceCandidate[];
	readonly quarantined: readonly IQuarantineCandidate[];
	readonly logicalDigest: string;
	readonly status: 'ok' | 'degraded';
}

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

const LIFECYCLE_STATUSES = new Set<string>([
	'draft',
	'ready',
	'in-progress',
	'review',
	'blocked',
	'paused',
	'done',
	'retired',
	'superseded',
	'quarantined',
]);

/**
 * Markdown slice statuses are prose, not an enum: `pending`, `done`,
 * `done (2026-07-24)`, `parked`, `promoted → x00165`. Only the first
 * token carries meaning; everything after it is a human annotation.
 */
const MARKDOWN_STATUS_ALIASES: Readonly<Record<string, string>> = {
	pending: 'ready',
	todo: 'ready',
	claimable: 'ready',
	open: 'ready',
	parked: 'paused',
	promoted: 'superseded',
	wip: 'in-progress',
	'in-progress': 'in-progress',
	inprogress: 'in-progress',
};

const normalizeLifecycleStatus = (raw: string | null): string | null => {
	if (raw === null) return null;
	const token = (raw.trim().split(/[\s(.,:;—–]/)[0] ?? '').toLowerCase();
	if (token === '') return null;
	if (LIFECYCLE_STATUSES.has(token)) return token;
	const alias = MARKDOWN_STATUS_ALIASES[token];
	return alias !== undefined ? alias : null;
};

const planStatusFor = (parsed: IParsedProposalMarkdown): TPlanStatus => {
	const raw =
		typeof parsed.frontmatter.status === 'string'
			? parsed.frontmatter.status
			: null;
	return (normalizeLifecycleStatus(raw) ?? 'ready') as TPlanStatus;
};

const sliceStatusFor = (section: IParsedSliceSection): TSliceStatus =>
	(normalizeLifecycleStatus(section.status) ?? 'ready') as TSliceStatus;

const toCandidate = (
	identity: IResolvedProposalIdentity,
	parsed: IParsedProposalMarkdown,
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
	identity: IQuarantinedProposalIdentity,
): IQuarantineCandidate => ({
	path: identity.path,
	errorCode: identity.reason,
	errorMessage: 'frontmatter.id is required for stable identity',
});

export const canonicalPlanCandidates = (
	plans: readonly IPlanCandidate[],
): readonly IPlanCandidate[] =>
	plans
		.map((plan) => ({ ...plan }))
		.sort(
			(a, b) =>
				a.uid.localeCompare(b.uid) || a.path.localeCompare(b.path),
		);

export const canonicalSliceCandidates = (
	slices: readonly ISliceCandidate[],
): readonly ISliceCandidate[] =>
	slices
		.map((slice) => ({ ...slice }))
		.sort(
			(a, b) =>
				a.uid.localeCompare(b.uid) || a.path.localeCompare(b.path),
		);

/**
 * The logical digest covers the three Git-derived entities. It is
 * computed from the canonical (sorted) projections, so it is
 * independent of the order in which files were read.
 */
export const digestEntityCandidates = (input: {
	readonly proposals: readonly IProposalCandidate[];
	readonly plans: readonly IPlanCandidate[];
	readonly slices: readonly ISliceCandidate[];
}): string =>
	sha256(
		JSON.stringify({
			proposals: canonicalProposalCandidates(input.proposals),
			plans: canonicalPlanCandidates(input.plans),
			slices: canonicalSliceCandidates(input.slices),
		}),
	);

/**
 * A markdown file projects a plan when it either declares itself a
 * plan (`kind: plan`) or actually carries slices. Everything else is a
 * flat proposal and yields no plan and no slices.
 */
const projectPlanAndSlices = (
	identity: IResolvedProposalIdentity,
	parsed: IParsedProposalMarkdown,
): {
	readonly plan: IPlanCandidate | null;
	readonly slices: readonly ISliceCandidate[];
} => {
	const sections = parseSliceSections(parsed.body);
	const isPlanKind = parsed.frontmatter.kind === 'plan';
	if (sections.length === 0 && !isPlanKind) {
		return { plan: null, slices: [] };
	}
	const planUid = planUidForProposal(identity.uid);
	const plan: IPlanCandidate = {
		uid: planUid,
		proposalUid: identity.uid,
		slug: slugFromUid(planUid),
		path: parsed.path,
		title: parsed.title,
		status: planStatusFor(parsed),
	};
	const seen = new Set<string>();
	const slices: ISliceCandidate[] = [];
	for (const section of sections) {
		const uid = sliceUid(identity.uid, section.sliceId);
		if (seen.has(uid)) continue;
		seen.add(uid);
		slices.push({
			uid,
			planUid,
			proposalUid: identity.uid,
			sliceId: section.sliceId,
			slug: slugFromUid(uid),
			path: parsed.path,
			title: section.title,
			status: sliceStatusFor(section),
		});
	}
	return { plan, slices };
};

export const reconcileProposalMarkdown = (
	input: IMarkdownReconcileInput,
): IReconcileResult => {
	const proposals: IProposalCandidate[] = [];
	const plans: IPlanCandidate[] = [];
	const slices: ISliceCandidate[] = [];
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
			const projected = projectPlanAndSlices(identity, parsed);
			if (projected.plan !== null) plans.push(projected.plan);
			slices.push(...projected.slices);
		} catch (error) {
			quarantined.push({
				path: file.path,
				errorCode: 'parse_failed',
				errorMessage:
					error instanceof Error ? error.message : String(error),
			});
		}
	}
	const orderedProposals = canonicalProposalCandidates(proposals);
	const orderedPlans = canonicalPlanCandidates(plans);
	const orderedSlices = canonicalSliceCandidates(slices);
	const logicalDigest = digestEntityCandidates({
		proposals: orderedProposals,
		plans: orderedPlans,
		slices: orderedSlices,
	});
	return {
		mode: input.mode,
		sourceCommit: input.sourceCommit,
		filesSeen: input.files.length,
		proposals: orderedProposals,
		plans: orderedPlans,
		slices: orderedSlices,
		quarantined,
		logicalDigest,
		status: quarantined.length === 0 ? 'ok' : 'degraded',
	};
};
