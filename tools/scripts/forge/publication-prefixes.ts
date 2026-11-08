/**
 * publication-prefixes.ts — the publication prefixes the queue reads,
 * every one the policy owns, current first.
 *
 * A project that changed its namespace still has pull requests open under
 * the former one; the queue keeps arming, ordering and disposing of them
 * until they end (f00808).
 */
import {
	ownedNamespaces,
	ownedPublicationRefPrefixes,
} from '@delendai/core/cli';

/** Whether `ref` lives under one of `prefixes`, followed by `rest`. */
export const underPublication = (
	ref: string,
	prefixes: string | readonly string[],
	rest = '',
): boolean =>
	(typeof prefixes === 'string' ? [prefixes] : prefixes).some(
		(prefix) => prefix.length > 0 && ref.startsWith(`${prefix}${rest}`),
	);

/** The owned publication prefixes as branch names, current first. */
export const publicationPrefixesOf = (
	branches: Parameters<typeof ownedPublicationRefPrefixes>[0],
): readonly string[] =>
	ownedPublicationRefPrefixes(branches).map((prefix) =>
		prefix.replace(/^refs\//u, '').replace(/^heads\//u, ''),
	);

/** The branches of the project as delendai owns them, for its prefixes. */
type IOwnedBranches = Parameters<typeof ownedNamespaces>[0];

/**
 * Where trains live: `<namespace>/train/` under each namespace the project
 * owns, the current one first (writers use it alone; readers take every
 * one, so a train or culprit marker left under a former namespace is still
 * found). An empty namespace gives `train/`. Beside the publication
 * namespace, never inside it, so nothing that opens or reaps publications
 * mistakes a train for one.
 */
export const trainPrefixesOf = (branches: IOwnedBranches): readonly string[] =>
	ownedNamespaces(branches).map((namespace) =>
		namespace === '' ? 'train/' : `${namespace}/train/`,
	);
