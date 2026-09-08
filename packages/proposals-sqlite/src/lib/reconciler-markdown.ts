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
import {
	normalizeLifecycleStatus,
	normalizeProposalKind,
} from './vocabulary';

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

const planStatusFor = (parsed: IParsedProposalMarkdown): TPlanStatus => {
	const raw =
		typeof parsed.frontmatter.status === 'string'
			? parsed.frontmatter.status
			: null;
	return (normalizeLifecycleStatus(raw) ?? 'ready') as TPlanStatus;
};

const sliceStatusFor = (section: IParsedSliceSection): TSliceStatus =>
	(normalizeLifecycleStatus(section.status) ?? 'ready') as TSliceStatus;

const rawString = (value: unknown): string | null =>
	typeof value === 'string' ? value : null;

/**
 * x00539 S1 — the candidate carries the NORMALISED vocabulary, never
 * the raw frontmatter token. `kind` and `status` are resolved through
 * `vocabulary.ts`, the same module the column enum is checked against,
 * so a value that reaches the writer is always one the CHECK accepts.
 */
const toCandidate = (
	identity: IResolvedProposalIdentity,
	parsed: IParsedProposalMarkdown,
): IProposalCandidate => ({
	uid: identity.uid,
	slug: identity.slug,
	path: parsed.path,
	title: parsed.title,
	kind: normalizeProposalKind(rawString(parsed.frontmatter.kind)),
	status: normalizeLifecycleStatus(rawString(parsed.frontmatter.status)),
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

/**
 * x00539 S1 — an unknown `kind` or `status` sends THAT ONE entity to
 * quarantine with the raw value in the reason. It never aborts the
 * run: quarantine is the contract f00515 defines for an entry the
 * projection cannot represent, and losing 348 good proposals because
 * three files carry an unknown token is exactly the bug this fixes.
 */
const vocabularyViolation = (
	candidate: IProposalCandidate,
	parsed: IParsedProposalMarkdown,
): IQuarantineCandidate | null => {
	if (candidate.kind === null) {
		const raw = rawString(parsed.frontmatter.kind);
		return {
			path: candidate.path,
			errorCode: 'unknown_kind',
			errorMessage:
				raw === null
					? `${candidate.uid}: frontmatter.kind is missing`
					: `${candidate.uid}: frontmatter.kind "${raw}" is not in the accepted vocabulary`,
		};
	}
	if (candidate.status === null) {
		const raw = rawString(parsed.frontmatter.status);
		return {
			path: candidate.path,
			errorCode: 'unknown_status',
			errorMessage:
				raw === null
					? `${candidate.uid}: frontmatter.status is missing`
					: `${candidate.uid}: frontmatter.status "${raw}" is not in the accepted vocabulary`,
		};
	}
	return null;
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
			const candidate = toCandidate(identity, parsed);
			const violation = vocabularyViolation(candidate, parsed);
			if (violation !== null) {
				quarantined.push(violation);
				continue;
			}
			proposals.push(candidate);
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
