/**
 * git-guard-namespaces.ts — the branch namespaces a development policy
 * uses, shared by the guard and its shape rules.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

/** `refs/heads/wip/`, `heads/wip/` and `wip/` are the same namespace. */
export const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The branch names and namespaces the policy itself uses. */
export const policyNamespaces = (
	policy: IResolvedDevelopmentPolicy,
): { exact: readonly string[]; prefixes: readonly string[] } => ({
	exact: [policy.branches.integration, policy.branches.release],
	prefixes: [
		policy.branches.workRefPrefix,
		policy.branches.publicationRefPrefix,
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
