/**
 * branch-delivery.ts — whether a branch has PROVABLY delivered its work,
 * decided by the ref-lifecycle verdict and not by how the branch is named.
 *
 * A tool that removes things must be able to say why each one was safe to
 * remove. "It starts with `agent/` and git says it is merged" is a guess
 * about the namespace with a fact bolted on; the reconciler already knows
 * what each namespace of THIS project is for, and only two of its roles
 * mean "nothing is lost by deleting this": a work ref whose content is in
 * the branch that contains it, and a publication ref whose pull request
 * merged. Everything else — a ref outside every namespace, a work ref that
 * was never published, a pull request closed unmerged — is kept, and the
 * verdict says why.
 *
 * The caller measures containment (git can) and passes it as
 * `publishedIn`; this decides what that means for the ref's role.
 */
import { resolveDevelopmentPolicy } from '../development-policy/resolve';
import { readWorkspacePolicy } from '../work-units/development-policy.service';

import { reconcileRefs } from './reconcile.service';

/** What the project's policy says about one branch's delivery. */
export interface IBranchDeliveryVerdict {
	/** The ref-lifecycle role the branch was given. */
	readonly role: string;
	/** True only when deleting or retiring the branch loses nothing. */
	readonly delivered: boolean;
	/** Why, in one sentence an operator can act on. */
	readonly reason: string;
}

/**
 * The verdict for `branch`, in the project rooted at `workspaceRoot`.
 *
 * `publishedIn` names the branch already containing the tip (usually the
 * integration branch); omit it when nothing contains it. `extraWorkPrefixes`
 * are further namespaces that hold working branches (the `agent_worktree`
 * one): a branch under one is judged as a work ref of that namespace.
 */
export const branchDeliveryVerdict = async (
	workspaceRoot: string,
	branch: { readonly name: string; readonly publishedIn?: string },
	extraWorkPrefixes: readonly string[] = [],
): Promise<IBranchDeliveryVerdict> => {
	const policy =
		(await readWorkspacePolicy(workspaceRoot).catch(() => undefined)) ??
		resolveDevelopmentPolicy({});
	const owner = extraWorkPrefixes.find((prefix) =>
		branch.name.startsWith(prefix),
	);
	const branches =
		owner === undefined
			? policy.branches
			: { ...policy.branches, workRefPrefix: owner };
	const { verdicts, reapable } = reconcileRefs(
		[
			{
				name: branch.name,
				...(branch.publishedIn === undefined
					? {}
					: { publishedIn: branch.publishedIn }),
			},
		],
		[],
		branches,
	);
	const verdict = verdicts[0];
	return {
		role: verdict?.role ?? 'unmanaged',
		delivered: reapable.length > 0,
		reason: verdict?.reason ?? 'the reconciler returned no verdict',
	};
};
