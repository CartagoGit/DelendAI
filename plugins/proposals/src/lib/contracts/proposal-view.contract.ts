/**
 * `proposal_view` projections — `r00031`.
 *
 * Three projection levels (compact | normal | full) for the
 * `proposal_get` tool. The pattern mirrors what `f00187` defines as the
 * transversal `detail` contract; this file is the proposals-side
 * implementation.
 *
 * Each projection:
 *   - takes an `IProposalDocument` (from `proposal-document.ts`),
 *   - returns a strictly-typed, JSON-serialisable shape,
 *   - never includes `undefined` fields (the projection is the wire
 *     shape, not the in-memory shape).
 */

import type {
	DetailProjection,
	DetailProjections,
} from '@mcp-vertex/core/public';

import type { IProposalDocument } from '../proposals/proposal-document';

// ---------------------------------------------------------------------------
// compact — minimal payload for list-scanning agents (< 2 KB).
// ---------------------------------------------------------------------------

export interface IProposalCompactView {
	readonly id: string;
	readonly status: string;
	readonly kind: string | null;
	readonly track: string;
	readonly title: string;
	readonly summary: string;
	readonly progress: string | null;
	readonly next: string | null;
}

// ---------------------------------------------------------------------------
// normal — two-level view for routine proposal reads (< 12 KB).
// ---------------------------------------------------------------------------

export interface IProposalNormalSlice {
	readonly id: string;
	readonly status: string;
	readonly title?: string;
}

export interface IProposalNormalAcceptance {
	readonly command: string;
	readonly expect: string;
}

export interface IProposalNormalView extends IProposalCompactView {
	readonly priority: string | null;
	readonly parentPlan: string | null;
	readonly auditSection: string | null;
	readonly related: readonly string[];
	readonly slices: readonly IProposalNormalSlice[];
	readonly acceptance: readonly IProposalNormalAcceptance[];
}

// ---------------------------------------------------------------------------
// full — the complete proposal tree (opt-in, the largest level).
// ---------------------------------------------------------------------------

export type IProposalFullView = IProposalDocument;

// ---------------------------------------------------------------------------
// Projectors.
// ---------------------------------------------------------------------------

/**
 * Compute the human-readable summary from the body. Falls back to the
 * first non-empty line when the canonical `goal` is missing.
 */
const summarise = (doc: IProposalDocument): string => {
	const goal = doc.body.goal.trim();
	if (goal.length > 0) return goal;
	const motivation = doc.body.motivation.trim();
	if (motivation.length > 0) return motivation;
	return doc.frontmatter.id;
};

const computeProgressAndNext = (
	doc: IProposalDocument,
): { progress: string | null; next: string | null } => {
	const criteria = doc.body.closureCriteria;
	if (criteria.length === 0) {
		return { progress: null, next: null };
	}
	// Heuristic: closure criteria lines that begin with `[x]` are done,
	// `[ ]` (or anything else) are pending. Pure on the markdown body.
	let progress: string | null = null;
	let next: string | null = null;
	for (const line of criteria) {
		const trimmed = line.trim();
		const isDone = /\[[xX]\]/.test(trimmed);
		const isPending = /\[\s\]/.test(trimmed);
		if (isDone) {
			progress = trimmed;
		} else if (isPending && next === null) {
			next = trimmed;
		}
	}
	if (next === null) {
		// Fallback to the first non-done line so consumers get a hint.
		const firstPending = criteria.find(
			(line) => !/\[[xX]\]/.test(line.trim()),
		);
		if (firstPending !== undefined) next = firstPending.trim();
	}
	return { progress, next };
};

export const projectProposalCompact = (
	doc: IProposalDocument,
): IProposalCompactView => {
	const { progress, next } = computeProgressAndNext(doc);
	const view: IProposalCompactView = {
		id: doc.frontmatter.id,
		status: doc.frontmatter.status,
		kind: doc.frontmatter.kind ?? null,
		track: doc.frontmatter.track,
		title: doc.frontmatter.id,
		summary: summarise(doc),
		progress,
		next,
	};
	return view;
};

export const projectProposalNormal = (
	doc: IProposalDocument,
): IProposalNormalView => {
	const compact = projectProposalCompact(doc);
	const slices = doc.body.closureCriteria.map((line) => {
		const trimmed = line.trim();
		return {
			id: trimmed.length > 0 ? trimmed : 'unknown',
			status: 'pending' as const,
		};
	});
	const acceptance = (doc.frontmatter.acceptanceCriteria ?? []).map((c) => ({
		command: c.command,
		expect: c.expect,
	}));
	const view: IProposalNormalView = {
		...compact,
		priority: null,
		parentPlan: null,
		auditSection: null,
		related: [],
		slices,
		acceptance,
	};
	return view;
};

export const projectProposalFull = (
	doc: IProposalDocument,
): IProposalFullView => doc;

export const PROPOSAL_DETAIL_PROJECTIONS: DetailProjections<IProposalDocument> =
	{
		compact: (doc: IProposalDocument) => projectProposalCompact(doc),
		normal: (doc: IProposalDocument) => projectProposalNormal(doc),
		full: (doc: IProposalDocument) => projectProposalFull(doc),
	};

/** Re-export the projector for callers that want to use one level only. */
export type IProposalDetailProjection = DetailProjection<IProposalDocument>;
