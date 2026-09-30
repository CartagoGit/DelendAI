/**
 * effective-policy.ts — the one answer to "what development model does
 * this project work under", declared or not.
 *
 * WHY there is one path: the server's connect-time instructions, `delendai
 * work` and the git guard each used to resolve the policy for themselves.
 * Two of them treated a project without a `development` block as having
 * no policy at all, while the instructions described a model to follow,
 * so an agent was told to run a command the same project refused. A
 * project that declared nothing is not a project with no rules: it
 * is a project delendai adopts a default for, and says so.
 *
 * WHY the integration branch is discovered here: the pure resolver can
 * only answer `develop`, which is one repository's habit. Where the
 * project names no integration branch, the stable one is discovered from
 * the checkout (see `default-branch.ts`), and without a release branch of
 * its own it releases from that same branch.
 */
import { sharedCheckout } from '../shared/shared-checkout';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { defaultBranchOf } from './default-branch';
import { resolveDevelopmentPolicy } from './resolve';
import type { IResolveDevelopmentPolicyInput } from './resolve.interface';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const nonEmptyString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const declaresIntegration = (input: IResolveDevelopmentPolicyInput): boolean =>
	nonEmptyString(input.development?.branches?.integration) !== undefined ||
	nonEmptyString(
		asRecord(input.legacy?.commitPolicyOptions?.push)?.branch,
	) !== undefined;

export interface IEffectivePolicyInput extends IResolveDevelopmentPolicyInput {
	/** The workspace, asked for its stable default branch when none is declared. */
	readonly workspaceRoot: string;
}

/**
 * Resolves the policy every reader of a workspace obeys: the declared
 * `development` block, else the legacy fields, else the built-in default.
 * `policy.source` says which, so a caller can say the model was adopted.
 */
export const resolveEffectivePolicy = (
	input: IEffectivePolicyInput,
): IResolvedDevelopmentPolicy => {
	const policy = resolveDevelopmentPolicy(input);
	if (declaresIntegration(input)) return policy;
	const discovered = defaultBranchOf(
		sharedCheckout(input.workspaceRoot) ?? input.workspaceRoot,
	);
	if (
		discovered === undefined ||
		discovered === policy.branches.integration
	) {
		return policy;
	}
	return {
		...policy,
		branches: {
			...policy.branches,
			integration: discovered,
			release:
				nonEmptyString(input.development?.branches?.release) ??
				discovered,
		},
	};
};
