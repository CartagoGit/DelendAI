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
 * `publishedIn`; this decides what that means for the ref's role. A
 * contained work ref is still not delivered while the one rule for a work
 * ref's life holds its proposal open: deleting it would take the unit the
 * forge shows for an in-progress proposal, and the queue's doctor would
 * ask for it back.
 */
import { resolveDevelopmentPolicy } from '../development-policy/resolve';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { readWorkspacePolicy } from '../work-units/development-policy.service';
import {
	workRefOpenness,
	workRefProposalOpen,
} from '../work-units/work-ref-lifecycle.service';

import { reconcileRefs } from './reconcile.service';
import type { IBranchDeliveryVerdict } from './reconcile.interface';

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
	const role = verdict?.role ?? 'unmanaged';
	if (
		reapable.length > 0 &&
		role === 'work-published' &&
		heldOpen(workspaceRoot, { branches }, branch.name, branches.integration)
	) {
		return {
			role,
			delivered: false,
			reason: 'its work landed but its proposal is in progress: the ref is the unit the forge shows for it',
		};
	}
	return {
		role,
		delivered: reapable.length > 0,
		reason: verdict?.reason ?? 'the reconciler returned no verdict',
	};
};

/** Whether the work-ref rule holds the landed ref's proposal open. */
const heldOpen = (
	root: string,
	policy: Parameters<typeof workUnitIdentityOf>[0],
	name: string,
	integration: string,
): boolean => {
	const proposal = workUnitIdentityOf(policy, name)?.proposal;
	return (
		proposal !== undefined &&
		workRefProposalOpen({
			landed: true,
			...workRefOpenness(
				root,
				proposal,
				`refs/heads/${name}`,
				`refs/heads/${integration}`,
			),
		})
	);
};
