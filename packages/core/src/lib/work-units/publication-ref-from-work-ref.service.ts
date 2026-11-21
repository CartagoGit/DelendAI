/**
 * publication-ref-from-work-ref.service.ts — the name a unit's publication
 * keeps, read through the namespaces the policy owns (f00808).
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	shortName as barePrefix,
} from '../integration/decisions/namespaces.helper';

/**
 * The publication ref for a work ref.
 *
 * A publication is not a new thing with a new name: it is the same unit of
 * work, published. So it keeps the name it already had, and only the
 * segment that says *in progress* becomes the one that says *proposed*.
 *
 * Deriving it is the whole point. `WORK_REF_SHAPE` states the shape once;
 * anything that asks a caller to spell the publication name invites a
 * second shape, and the second shape always wins in practice, because the
 * caller is whatever agent happens to be publishing. Every `pr/` ref in
 * this repository's namespace was flat for exactly that reason.
 *
 * Returns `undefined` when the ref is not under the policy's work-ref
 * prefix — there is then no name to keep, and guessing one is the
 * behaviour this function exists to remove.
 */
export const publicationRefFromWorkRef = (
	policy: IResolvedDevelopmentPolicy,
	workRef: string,
): string | undefined => {
	const work = barePrefix(workRef.replace(/^refs\//u, ''));
	// A unit keeps the namespace it was entered under: one under a former
	// prefix publishes under that namespace's publication prefix, and a
	// unit of the current one under the current (f00808).
	const publications = ownedPublicationRefPrefixes(policy.branches);
	const owned = ownedWorkRefPrefixes(policy.branches);
	for (const [at, prefix] of owned.entries()) {
		const workPrefix = barePrefix(prefix);
		const publication = publications[at];
		if (
			workPrefix.length === 0 ||
			publication === undefined ||
			!work.startsWith(workPrefix)
		) {
			continue;
		}
		const tail = work.slice(workPrefix.length);
		if (tail.length === 0) return undefined;
		return `refs/heads/${barePrefix(publication)}${tail}`;
	}
	return undefined;
};
