/**
 * owned-ref-prefixes.ts — every ref prefix delendai owns in a project:
 * the current namespace first, then each former one.
 *
 * A project that changes `namespacePrefix` still has units and pull
 * requests under the old namespace. Readers (guards, reapers, the queue)
 * take these lists so those refs stay delendai's until they end; writers
 * keep using the current prefix alone.
 */
import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';

type IOwnedBranches = Pick<
	IPolicyBranches,
	| 'namespacePrefix'
	| 'formerNamespacePrefixes'
	| 'workRefPrefix'
	| 'workRefVisibility'
	| 'publicationRefPrefix'
>;

const withSlash = (namespace: string): string =>
	namespace === '' ? '' : `${namespace}/`;

const distinct = (values: readonly string[]): readonly string[] => [
	...new Set(values),
];

const formerOf = (branches: IOwnedBranches): readonly string[] =>
	(branches.formerNamespacePrefixes ?? []).filter(
		(former) => former !== branches.namespacePrefix,
	);

/** The current namespace, then each former one, with no trailing slash. */
export const ownedNamespaces = (branches: IOwnedBranches): readonly string[] =>
	distinct([branches.namespacePrefix, ...formerOf(branches)]);

/**
 * Work-ref prefixes, current first. Empty when the project writes no
 * work refs: a former namespace does not switch cleanup back on.
 */
export const ownedWorkRefPrefixes = (
	branches: IOwnedBranches,
): readonly string[] => {
	if (branches.workRefPrefix === '') return [];
	const heads = branches.workRefVisibility === 'visible' ? 'heads/' : '';
	return distinct([
		branches.workRefPrefix,
		...formerOf(branches).map(
			(former) => `${heads}${withSlash(former)}wip/`,
		),
	]);
};

/** Publication prefixes, current first. */
export const ownedPublicationRefPrefixes = (
	branches: IOwnedBranches,
): readonly string[] =>
	distinct([
		branches.publicationRefPrefix,
		...formerOf(branches).map((former) => `${withSlash(former)}pr/`),
	]);
