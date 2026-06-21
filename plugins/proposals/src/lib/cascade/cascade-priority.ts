import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';

/**
 * Default cascade order (f00024): fixes ship first (broken-now beats
 * breaking-later), breaking changes before fresh features, then the
 * rest roughly by urgency. See f00024 §"Orden por defecto" for the
 * rationale behind every rank. `legacy` (l) keeps rank 11 and the
 * retired `p` alias sits one slot behind it (rank 12) — `p` is not an
 * `IProposalKind` so it is appended separately by `buildKindOrder`.
 */
export const DEFAULT_KIND_ORDER: readonly IProposalKind[] = [
	'fix',
	'breaking',
	'audit',
	'chore',
	'feat',
	'refactor',
	'perf',
	'docs',
	'test',
	'infra',
	'spike',
	'legacy',
];

/** Cascade rank reserved for the retired `p` prefix (legacy alias). */
export const LEGACY_ALIAS_PREFIX = 'p';

export type TCascadeBoost =
	| 'shipped-blocking'
	| 'customer-reported'
	| 'security';

/**
 * Intra-kind penalties applied by a boost. A boost only ever moves a
 * proposal towards the front of its OWN kind — never across kinds —
 * so `x` (fix) always outranks `f` (feat) regardless of boosts. See
 * f00024 §"Boosts" for why this invariant must hold.
 */
export const DEFAULT_BOOST_PENALTIES: ReadonlyMap<TCascadeBoost, number> =
	new Map([
		['shipped-blocking', 0.5],
		['customer-reported', 0.3],
		['security', 0.5],
	]);

/**
 * Minimal shape a cascade resolver needs from a proposal. Deliberately
 * NOT the full `IProposal`/index-entry type (ISP) — the resolver has
 * no business knowing about `status`, `track`, `title`, etc.
 */
export interface IProposalSummary {
	readonly id: string;
	readonly kind: IProposalKind | typeof LEGACY_ALIAS_PREFIX;
	/** Break-glass: pins the proposal to an absolute numeric priority. */
	readonly cascadeOverride?: number;
	/** Mandatory companion of `cascadeOverride` — kept for audit/logging. */
	readonly cascadeOverrideReason?: string;
	/** Intra-kind boost: moves the proposal to the front of its kind. */
	readonly cascadeBoost?: TCascadeBoost;
}

/** A single step in the cascade-priority Chain of Responsibility. */
export interface ICascadePriorityResolver {
	/** Resolves the absolute priority. Lower sorts first. */
	resolve(proposal: IProposalSummary): number;
}

/**
 * Builds the kind -> rank map from an ordered list of kinds, then
 * appends the `p` legacy alias one rank behind `legacy`. Pure function
 * — no disk access, fully testable with a synthetic kind order.
 */
export const buildKindOrder = (
	order: readonly IProposalKind[] = DEFAULT_KIND_ORDER,
): ReadonlyMap<IProposalKind | typeof LEGACY_ALIAS_PREFIX, number> => {
	const map = new Map<IProposalKind | typeof LEGACY_ALIAS_PREFIX, number>();
	order.forEach((kind, index) => {
		map.set(kind, index);
	});
	const legacyRank = map.get('legacy');
	map.set(
		LEGACY_ALIAS_PREFIX,
		legacyRank === undefined ? order.length : legacyRank + 1,
	);
	return map;
};

/**
 * Step 1 of the chain: priority purely by kind (+ intra-kind boost
 * penalty). Unknown kinds sort last (`+Infinity`) instead of throwing,
 * so a future kind added to the glossary without a cascade entry never
 * crashes `auto_work` — it just falls to the back of the queue.
 */
export class KindCascadePriorityResolver implements ICascadePriorityResolver {
	constructor(
		private readonly kindOrder: ReadonlyMap<
			IProposalKind | typeof LEGACY_ALIAS_PREFIX,
			number
		>,
		private readonly boostPenalties: ReadonlyMap<
			TCascadeBoost,
			number
		> = DEFAULT_BOOST_PENALTIES,
	) {}

	resolve(proposal: IProposalSummary): number {
		const base = this.kindOrder.get(proposal.kind);
		if (base === undefined) return Number.POSITIVE_INFINITY;
		const penalty = proposal.cascadeBoost
			? (this.boostPenalties.get(proposal.cascadeBoost) ?? 0)
			: 0;
		return base - penalty;
	}
}

/**
 * Step 2 of the chain: break-glass override. When
 * `cascadeOverride` is a finite number it always wins over the inner
 * resolver, regardless of kind or boost. Callers are expected to
 * enforce (lint-time) that `cascadeOverride` never appears without a
 * `cascadeOverrideReason` — this resolver does not validate that; it
 * is a pure priority calculator, not a linter.
 */
export class FrontmatterOverrideResolver implements ICascadePriorityResolver {
	constructor(private readonly inner: ICascadePriorityResolver) {}

	resolve(proposal: IProposalSummary): number {
		if (typeof proposal.cascadeOverride === 'number') {
			if (!proposal.cascadeOverrideReason) {
				throw new Error(
					`cascadeOverride is set on "${proposal.id}" without a cascadeOverrideReason — every override must carry an audit reason.`,
				);
			}
			return proposal.cascadeOverride;
		}
		return this.inner.resolve(proposal);
	}
}
