/**
 * The development policy, asked about one git operation.
 *
 * Guidance can be ignored. An adopter project on `shared-checkout-merge`
 * had its agent commit straight to `develop` and create worktrees and
 * `agent/*` branches by hand, and nothing in git stopped either. A hook
 * that asks this judge stops them for every agent and every human, whatever
 * tool they use. Every refusal is a reading of the resolved policy; with
 * no policy, nothing is refused.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IGitGuardVerdict,
	IGuardedGitOperation,
} from '../contracts/interfaces/git-guard.interface';
import { describeWorkIsolation } from './work-isolation';

const allow = (reason: string): IGitGuardVerdict => ({
	refused: false,
	reason,
});

/** `refs/heads/wip/`, `heads/wip/` and `wip/` are the same namespace. */
const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The branch names and namespaces the policy itself uses. */
const policyNamespaces = (
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

const insideNamespaces = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): boolean => {
	const { exact, prefixes } = policyNamespaces(policy);
	return (
		exact.includes(branch) ||
		prefixes.some((prefix) => branch.startsWith(prefix))
	);
};

const namespaceList = (policy: IResolvedDevelopmentPolicy): string => {
	const { exact, prefixes } = policyNamespaces(policy);
	return [
		...exact.map((name) => `\`${name}\``),
		...prefixes.map((p) => `\`${p}*\``),
	].join(', ');
};

const judgeCommit = (
	policy: IResolvedDevelopmentPolicy,
	branch: string | undefined,
	isMerge: boolean,
	inMainWorktree: boolean,
): IGitGuardVerdict => {
	if (branch === undefined) return allow('a detached HEAD is not a branch.');
	if (isMerge) return allow('a merge is how an integration branch moves.');
	if (
		branch === policy.branches.integration &&
		!policy.persistence.allowsDirectIntegrationCommit
	) {
		return {
			refused: true,
			reason: `the \`${policy.profile}\` development profile forbids committing directly to \`${branch}\`.`,
			remedy: describeWorkIsolation(policy).rule,
		};
	}
	if (policy.workspace.pinnedCheckout && !insideNamespaces(policy, branch)) {
		return {
			refused: true,
			reason: `\`${branch}\` is outside the branches the \`${policy.profile}\` development profile uses (${namespaceList(policy)}).`,
			remedy: describeWorkIsolation(policy).rule,
		};
	}
	// The pinned checkout is the one every other agent reads. Under a
	// pinned policy it stays on the integration branch, and work refs are
	// WRITTEN there (`commit-tree`, HEAD untouched), never checked out and
	// committed on. Allowing this is what let a work branch be created by
	// hand, committed to and pushed with every gate green. In a linked
	// worktree under `agentWorktrees` the same commit IS the model.
	if (
		policy.workspace.pinnedCheckout &&
		branch !== policy.branches.integration &&
		inMainWorktree
	) {
		return {
			refused: true,
			reason: `the shared checkout is on \`${branch}\`, but the \`${policy.profile}\` development profile anchors it to \`${policy.branches.integration}\`.`,
			remedy: `Return it with \`git switch ${policy.branches.integration}\` — your edits stay in the working tree — then persist the work with \`delendai work checkpoint\`, which writes your ref without moving HEAD.`,
		};
	}
	return allow(`\`${branch}\` is a branch the policy uses.`);
};

const judgeBranchCreate = (
	policy: IResolvedDevelopmentPolicy,
	ref: string,
): IGitGuardVerdict => {
	if (!ref.startsWith('refs/heads/')) {
		return allow('only local branches are judged.');
	}
	const branch = ref.slice('refs/heads/'.length);
	if (!policy.workspace.pinnedCheckout || insideNamespaces(policy, branch)) {
		return allow(`\`${branch}\` may be created under the policy.`);
	}
	return {
		refused: true,
		reason: `the \`${policy.profile}\` development profile does not create \`${branch}\`: branches are limited to ${namespaceList(policy)}.`,
		remedy: describeWorkIsolation(policy).rule,
	};
};

const judgePush = (
	policy: IResolvedDevelopmentPolicy,
	remoteRef: string,
	deleting: boolean,
): IGitGuardVerdict => {
	if (!remoteRef.startsWith('refs/heads/')) {
		return allow('only branches are judged.');
	}
	if (deleting)
		return allow('removing a branch never loses integrated work.');
	const branch = remoteRef.slice('refs/heads/'.length);
	const protectedBranch =
		branch === policy.branches.integration ||
		branch === policy.branches.release;
	if (protectedBranch && policy.integration.requiresPullRequest) {
		return {
			refused: true,
			reason: `the \`${policy.profile}\` development profile integrates \`${branch}\` through pull requests, not pushes.`,
			remedy: `Push a branch under \`${shortName(policy.branches.publicationRefPrefix)}\` and open a pull request into \`${branch}\`.`,
		};
	}
	if (policy.workspace.pinnedCheckout && !insideNamespaces(policy, branch)) {
		return {
			refused: true,
			reason: `\`${branch}\` is outside the branches the \`${policy.profile}\` development profile uses (${namespaceList(policy)}).`,
			remedy: describeWorkIsolation(policy).rule,
		};
	}
	return allow(`\`${branch}\` may be pushed under the policy.`);
};

/** Judge one git operation against the resolved policy. */
export const judgeGitOperation = (
	policy: IResolvedDevelopmentPolicy | undefined,
	operation: IGuardedGitOperation,
): IGitGuardVerdict => {
	if (policy === undefined) {
		return allow('no development policy is declared.');
	}
	switch (operation.kind) {
		case 'commit':
			return judgeCommit(
				policy,
				operation.branch,
				operation.isMerge,
				operation.inMainWorktree ?? true,
			);
		case 'branch-create':
			return judgeBranchCreate(policy, operation.ref);
		case 'push':
			return judgePush(policy, operation.remoteRef, operation.deleting);
	}
};
