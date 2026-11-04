/**
 * publication-prefixes.ts — the publication prefixes the queue reads,
 * every one the policy owns, current first.
 *
 * A project that changed its namespace still has pull requests open under
 * the former one; the queue keeps arming, ordering and disposing of them
 * until they end (f00808).
 */
import { ownedPublicationRefPrefixes } from '@delendai/core/public';

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
