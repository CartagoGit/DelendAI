import {
	buildKindOrder,
	FrontmatterOverrideResolver,
	KindCascadePriorityResolver,
} from './cascade-priority';
import type {
	ICascadePriorityResolver,
	IProposalSummary,
} from './cascade-priority';
import { DEFAULT_KIND_ORDER } from './cascade-priority';
import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';

/**
 * Composes the default production cascade: kind-based priority,
 * decorated with the frontmatter break-glass override. Consumers
 * (`continue_proposal`, `auto_work`) depend on `ICascadePriorityResolver`,
 * not on this factory — tests inject their own chain/fakes (DIP).
 */
export const buildDefaultCascadeChain = (
	order: readonly IProposalKind[] = DEFAULT_KIND_ORDER,
): ICascadePriorityResolver =>
	new FrontmatterOverrideResolver(
		new KindCascadePriorityResolver(buildKindOrder(order)),
	);

/** Convenience: resolve + sort a batch of proposals by cascade priority. */
export const sortByCascade = <T extends IProposalSummary>(
	proposals: readonly T[],
	resolver: ICascadePriorityResolver = buildDefaultCascadeChain(),
): T[] =>
	[...proposals].sort((a, b) => {
		const byPriority = resolver.resolve(a) - resolver.resolve(b);
		return byPriority !== 0 ? byPriority : a.id.localeCompare(b.id);
	});
