/**
 * workflow-doctor.service.ts — where the invariants are judged FROM.
 *
 * `--show-toplevel` answers the worktree this runs in, and the
 * invariants are about the pinned checkout. `--git-common-dir` is the
 * one path that is the same from either, so its parent is always the
 * shared checkout — which is what makes `doctor` tell the truth when an
 * agent runs it from inside its own worktree.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	type IResolvedDevelopmentPolicy,
	resolveDevelopmentPolicy,
	sharedCheckout,
} from '@delendai/core/public';

import type { IInvariantReport } from '../contracts/interfaces/workflow-invariants.interface';
import { checkWorkflowInvariants } from './workflow-invariants.service';

/**
 * The shared checkout, whichever worktree the caller is standing in.
 *
 * Kept as a named re-export because callers already import it from here;
 * the implementation is core's, so the guard, the doctor and the
 * proposals reconciler cannot disagree about what "the checkout" means.
 */
export const sharedCheckoutOf = sharedCheckout;

/** The policy a workspace declares, or the defaults when it declares none. */
export const policyOf = async (
	root: string,
): Promise<IResolvedDevelopmentPolicy> => {
	let declared: Record<string, unknown> = {};
	try {
		declared = JSON.parse(
			await readFile(join(root, 'delendai.config.json'), 'utf8'),
		) as Record<string, unknown>;
	} catch {
		declared = {};
	}
	const development = declared.development;
	return resolveDevelopmentPolicy(
		development === null || typeof development !== 'object'
			? {}
			: { development: development as Record<string, unknown> },
	);
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
