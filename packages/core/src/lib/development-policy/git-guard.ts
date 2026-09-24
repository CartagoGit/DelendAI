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
	IGitGuardActor,
	IGitGuardVerdict,
	IGuardedGitOperation,
} from '../contracts/interfaces/git-guard.interface';
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
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

/**
 * A work ref whose name does not match the policy's own template.
 *
 * Undefined when there is nothing to say: no template declared, or the
 * ref is not in the work namespace, or it parses. The parser is the SAME
 * one the reconciler attributes refs with, so "git accepted it" and "the
 * system can attribute it" cannot drift apart.
 */
const refuseUnshapedWorkRef = (
	policy: IResolvedDevelopmentPolicy,
	ref: string,
	branch: string,
): IGitGuardVerdict | undefined => {
	const template = policy.branches.workRefTemplate;
	const prefix = shortName(policy.branches.workRefPrefix);
	if (template.length === 0 || prefix.length === 0) return undefined;
	if (!branch.startsWith(prefix)) return undefined;
	const parser = compileWorkRefParser(
		template,
		policy.branches.workRefPrefix,
		{ strict: true },
	);
	if (parser === undefined || parser.parse(ref) !== undefined) {
		return undefined;
	}
	return {
		refused: true,
		reason: `\`${branch}\` is in the work namespace but does not match the shape the \`${policy.profile}\` profile declares (\`${template}\`), so nothing can attribute it to a proposal, a slice or a generation.`,
		remedy: 'Let the name come from the policy instead of typing it: `delendai work enter --proposal=<id> --slice=<id>` (or `work checkpoint`) renders it from the same template the reconciler reads.',
	};
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
		// Inside the WORK namespace the name is not free-form: the policy
		// states its shape, and a ref that does not match it cannot be
		// attributed to a proposal, a slice or a generation. Typing the
		// name by hand is how `…-g1-cli-shape` and `…/visual-studio-code/…`
		// ended up in the graph beside the convention (x00563 S3).
		// Only where the policy pins the checkout: a profile that gives
		// every agent its own worktree deliberately lets them name their
		// branches, and this must not take that away.
		if (policy.workspace.pinnedCheckout) {
			const shapeRefusal = refuseUnshapedWorkRef(policy, ref, branch);
			if (shapeRefusal !== undefined) return shapeRefusal;
		}
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

/**
 * An agent may not stash.
 *
 * `refs/stash` is one stack shared by every worktree of the repository.
 * Work an agent pushes there belongs to nobody: another agent in another
 * worktree can pop it into its own tree, `git stash clear` from anywhere
 * deletes it, and nothing in the work model (claims, work refs,
 * generations, publication) can see it. An agent that stashes to "tidy
 * up" a checkout hides somebody's work where the only way back is luck.
 */
const judgeStash = (policy: IResolvedDevelopmentPolicy): IGitGuardVerdict => ({
	refused: true,
	reason: `an agent does not use \`git stash\` under the \`${policy.profile}\` development profile: \`refs/stash\` is one stack shared by every worktree of this repository, so what goes there is invisible to the work model and can be popped or cleared from anywhere.`,
	remedy: `Keep the work where it is owned: commit it, or checkpoint it to a work ref (\`delendai work checkpoint\`). ${describeWorkIsolation(policy).rule}`,
});

/**
 * Judge one git operation against the resolved policy.
 *
 * Only an agent is judged. The policy exists so agents that share a
 * repository do not leave work behind or step on each other; it is not
 * a limit on how a person uses their own repository. A person creates
 * whatever branch they like, commits where they like and stashes when
 * they like, and whatever the forge enforces (branch protection) is the
 * repository owner's own rule, not delendai's. The actor is required, so
 * every caller has to say who is acting.
 */
export const judgeGitOperation = (
	policy: IResolvedDevelopmentPolicy | undefined,
	operation: IGuardedGitOperation,
	actor: IGitGuardActor,
): IGitGuardVerdict => {
	if (policy === undefined) {
		return allow('no development policy is declared.');
	}
	if (actor.agentMarker === undefined) {
		return allow(
			'a person is running git; the development policy governs agents.',
		);
	}
	const verdict = judgeAgentOperation(policy, operation);
	return verdict.refused
		? {
				...verdict,
				reason: `${verdict.reason} (identified as an agent by \`${actor.agentMarker}\`)`,
			}
		: verdict;
};

const judgeAgentOperation = (
	policy: IResolvedDevelopmentPolicy,
	operation: IGuardedGitOperation,
): IGitGuardVerdict => {
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
		case 'stash':
			return judgeStash(policy);
	}
};
