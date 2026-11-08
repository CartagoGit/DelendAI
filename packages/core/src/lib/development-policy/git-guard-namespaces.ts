/**
 * git-guard-namespaces.ts — the branch namespaces a development policy
 * uses, shared by the guard and its shape rules.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import {
	ownedPublicationRefPrefixes,
	ownedTrainPrefixes,
	ownedWorkRefPrefixes,
} from './owned-ref-prefixes';
import { protectedBranchNames } from './release-branch';

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
