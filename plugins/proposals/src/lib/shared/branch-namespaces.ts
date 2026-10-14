/**
 * branch-namespaces.ts — which branch names the swarm tools treat as an
 * agent's, decided by the project's development policy.
 *
 * The tools that snapshot or reap branches used to filter on a literal
 * `agent/` prefix. That is the namespace of `agent_worktree`, one way of
 * making a working branch — not where a project's work lives. A unit of
 * work is a ref under the policy's work-ref namespace, and what it
 * publishes goes under the publication namespace; a tool that listed
 * `agent/*` in such a project answered about branches that did not exist
 * and was blind to the ones that did. Both prefixes are read from the
 * policy, and `agent/` stays in the set for as long as `agent_worktree`
 * creates branches there.
 */
import { projectBranches } from '@delendai/core/public';

import { AGENT_BRANCH_PREFIX } from '../contracts/constants/agent-branch-convention.constant';

const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

const distinct = (prefixes: readonly string[]): readonly string[] => [
	...new Set(prefixes.map(bare).filter((prefix) => prefix.length > 0)),
];

/** The prefixes a branch an agent WORKS on can carry: work refs and `agent/`. */
export const workBranchPrefixes = async (
	workspaceRoot: string,
): Promise<readonly string[]> =>
	distinct([
		(await projectBranches(workspaceRoot)).workRefPrefix,
		AGENT_BRANCH_PREFIX,
	]);

/** The prefixes whose branches belong to the swarm: work, publication, `agent/`. */
export const managedBranchPrefixes = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const project = await projectBranches(workspaceRoot);
	return distinct([
		project.workRefPrefix,
		project.publicationRefPrefix,
		AGENT_BRANCH_PREFIX,
	]);
};

/** Whether `branch` sits under any of `prefixes`; an empty prefix admits all. */
export const isUnderPrefixes = (
	branch: string,
	prefixes: readonly string[],
): boolean =>
	prefixes.some((prefix) => prefix.length === 0 || branch.startsWith(prefix));
