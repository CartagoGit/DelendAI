/**
 * diverged-review-pack.service.ts — a review pack that holds commits its
 * reviewer's wip lacks (x01032).
 *
 * A reviewer's claims and verdicts all belong on one review wip, and the
 * pack is cut from it by `work publish`. PR #1771 carried a verdict
 * without its claim because the claim sat on a second wip, an `implement`
 * unit entered by hand, while the pack was cut from the review one. The
 * two refs diverged and nothing said so until CI refused the pack.
 */
import type { IDivergedReviewPack } from '../contracts/interfaces/diverged-review-pack.interface';

/** The lane, agent, kind and unit a unit ref names. */
const UNIT_OF_REF =
	/^(?:refs\/heads\/)?(?<prefix>[^/]+)\/(?<lane>wip|pr)\/(?<agent>[^/]+)\/(?<kind>[^/]+)\/(?<unit>[a-z]\d{5,}-[^/]+|batch-[^/]+)(?:\/|$)/iu;

const parsed = (ref: string) => UNIT_OF_REF.exec(ref)?.groups;

/**
 * The review packs whose commits are not all in a wip of the same agent
 * and unit. `refs` maps ref name to tip; `isAncestor(a, b)` is whether `a`
 * is reachable from `b`.
 */
export const divergedReviewPacks = (input: {
	readonly refs: ReadonlyMap<string, string>;
	readonly isAncestor: (sha: string, of: string) => boolean;
}): readonly IDivergedReviewPack[] => {
	const wips = [...input.refs].flatMap(([ref, sha]) => {
		const at = parsed(ref);
		return at?.lane === 'wip' ? [{ ref, sha, at }] : [];
	});
	return [...input.refs].flatMap(([ref, sha]) => {
		const at = parsed(ref);
		if (at?.lane !== 'pr' || at.kind !== 'review') return [];
		const mine = wips.filter(
			(wip) => wip.at.agent === at.agent && wip.at.unit === at.unit,
		);
		if (mine.length === 0) return [];
		// Fine when any of the agent's wips for this unit holds the pack.
		if (mine.some((wip) => input.isAncestor(sha, wip.sha))) return [];
		const wip = mine.find((entry) => entry.at.kind === 'review') ?? mine[0];
		return wip === undefined
			? []
			: [{ pack: ref, wip: wip.ref, merge: `git merge ${ref}` }];
	});
};
