/**
 * namespaces.ts — the allowed namespaces of integration, decided once:
 * every ref prefix delendai owns in a project (the current namespace
 * first, then each former one), which branches a policy admits, and the
 * forge ruleset's patterns for them.
 *
 * A project that changes `namespacePrefix` still has units and pull
 * requests under the old namespace. Readers (guards, reapers, the queue)
 * take these lists so those refs stay delendai's until they end; writers
 * keep using the current prefix alone.
 */
import type {
	IPolicyBranches,
	IResolvedDevelopmentPolicy,
} from '../../contracts/interfaces/development-policy.interface';
import { protectedBranchNames } from '../../development-policy/release-branch';

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

/**
 * Merge-train prefixes, current first: `<namespace>/train/` beside the
 * publication namespace (never inside it, so nothing that opens or reaps
 * publications mistakes a train for one); an empty namespace gives
 * `train/`. Writers use the first; readers, the guard and the forge
 * ruleset take every one, so the queue's own train refs are admitted
 * wherever the policy admits its work and publication refs.
 */
export const ownedTrainPrefixes = (
	branches: IOwnedBranches,
): readonly string[] =>
	ownedNamespaces(branches).map(
		(namespace) => `${withSlash(namespace)}train/`,
	);

/** `refs/heads/wip/`, `heads/wip/` and `wip/` are the same namespace. */
export const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The branch names and namespaces the policy uses, former ones included. */
export const policyNamespaces = (
	policy: IResolvedDevelopmentPolicy,
): { exact: readonly string[]; prefixes: readonly string[] } => ({
	exact: protectedBranchNames(policy.branches),
	prefixes: [
		...ownedWorkRefPrefixes(policy.branches),
		...ownedPublicationRefPrefixes(policy.branches),
		// The queue pushes its trains here; a guard that refused them
		// declined every train push the forge itself admitted.
		...ownedTrainPrefixes(policy.branches),
		...policy.branches.foreignRefPrefixes,
	]
		.map(shortName)
		.filter((prefix) => prefix.length > 0),
});

export const insideNamespaces = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): boolean => {
	const { exact, prefixes } = policyNamespaces(policy);
	return (
		exact.includes(branch) ||
		prefixes.some((prefix) => branch.startsWith(prefix))
	);
};

/** Whether `ref` lives under one of `prefixes`, followed by `rest`. */
export const underPublication = (
	ref: string,
	prefixes: string | readonly string[],
	rest = '',
): boolean =>
	(typeof prefixes === 'string' ? [prefixes] : prefixes).some(
		(prefix) => prefix.length > 0 && ref.startsWith(`${prefix}${rest}`),
	);

/** Whether `branch` lives under `prefix` (qualified or not); an empty one admits nothing. */
export const underNamespace = (
	branch: string,
	prefix: string | undefined,
): boolean =>
	prefix !== undefined &&
	prefix !== '' &&
	branch.startsWith(shortName(prefix));

/** The owned publication prefixes as branch names, current first. */
export const publicationPrefixesOf = (
	branches: IOwnedBranches,
): readonly string[] => ownedPublicationRefPrefixes(branches).map(shortName);

/**
 * The ref patterns the forge ruleset admits for creation: the same
 * namespaces the guard admits (`insideNamespaces`), written as the
 * forge's globs. A publication carries the name of the work it
 * publishes, so its namespace is as deep as the work namespace (`**` + `/*`).
 */
export const allowedRefPatterns = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
): readonly string[] => {
	const { branches } = policy;
	return [
		...protectedBranchNames(branches).map(
			(branch) => `refs/heads/${branch}`,
		),
		// Every owned namespace, the former ones included: a unit entered
		// before a namespace change still publishes under its own (f00808).
		...(branches.workRefVisibility === 'visible'
			? ownedWorkRefPrefixes(branches).map(
					(prefix) =>
						`${prefix.startsWith('refs/') ? prefix : `refs/${prefix}`}**/*`,
				)
			: []),
		...ownedPublicationRefPrefixes(branches)
			.filter((prefix) => prefix !== '')
			.map((prefix) => `refs/heads/${prefix}**/*`),
		...ownedTrainPrefixes(branches).map(
			(prefix) => `refs/heads/${prefix}**/*`,
		),
		...branches.foreignRefPrefixes.map(
			(prefix) => `refs/heads/${prefix}**`,
		),
	];
};
