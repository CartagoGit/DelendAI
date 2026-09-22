/**
 * workflow-doctor.service.ts — where the invariants are judged FROM.
 *
 * `--show-toplevel` answers the worktree this runs in, and the
 * invariants are about the pinned checkout. `--git-common-dir` is the
 * one path that is the same from either, so its parent is always the
 * shared checkout — which is what makes `doctor` tell the truth when an
 * agent runs it from inside its own worktree.
 */
import {
	type IResolvedDevelopmentPolicy,
	resolveDevelopmentPolicy,
	sharedCheckout,
} from '@delendai/core/public';

import type { IInvariantReport } from '../contracts/interfaces/workflow-invariants.interface';
import { readWorkspacePolicy } from './development-policy.service';
import { checkWorkflowInvariants } from './workflow-invariants.service';

/**
 * The shared checkout, whichever worktree the caller is standing in.
 *
 * Kept as a named re-export because callers already import it from here;
 * the implementation is core's, so the guard, the doctor and the
 * proposals reconciler cannot disagree about what "the checkout" means.
 */
export const sharedCheckoutOf = sharedCheckout;

/**
 * The policy a workspace declares, or the defaults when it declares
 * none.
 *
 * `readWorkspacePolicy` and nothing else. This used to call
 * `resolveDevelopmentPolicy` itself — a SECOND reader of the same
 * configuration, which is exactly what that service's own docstring
 * warns against: "a second reader is a second chance to disagree about
 * what the project declared."
 *
 * They did disagree. x00602 taught the first reader to discover the
 * integration branch instead of assuming `develop`, and the doctor,
 * reading separately, went on telling a project whose trunk is `main`
 * that it should `git switch develop`.
 *
 * The doctor must still run where there is no policy at all, so an
 * absent or unreadable configuration falls back to the resolved
 * defaults rather than refusing — a diagnosis is most wanted exactly
 * when something is wrong.
 */
export const policyOf = async (
	root: string,
): Promise<IResolvedDevelopmentPolicy> => {
	try {
		return (
			(await readWorkspacePolicy(root)) ?? resolveDevelopmentPolicy({})
		);
	} catch {
		return resolveDevelopmentPolicy({});
	}
};

/** Run the doctor from wherever the caller is standing. */
export const runWorkflowDoctor = async (input: {
	readonly from: string;
	readonly scopes?: readonly ('checkout' | 'forge')[];
}): Promise<IInvariantReport | undefined> => {
	const root = sharedCheckoutOf(input.from);
	if (root === undefined) return undefined;
	return checkWorkflowInvariants({
		root,
		policy: await policyOf(root),
		...(input.scopes === undefined ? {} : { scopes: input.scopes }),
	});
};
