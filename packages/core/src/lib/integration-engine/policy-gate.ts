/**
 * policy-gate.ts — the first thing the cycle does, and the reason this
 * engine cannot be turned on by accident.
 *
 * A project that resolved `integration.strategy: 'direct'` has said its
 * work reaches the integration branch by pushing, gated by local policy.
 * Running a pull-request engine against it anyway would not be a helpful
 * default — it would silently impose a review surface, a check surface
 * and a merge queue the operator explicitly did not ask for. So the gate
 * DECLINES, with the axis and the value that made it decline, and the
 * caller reports that rather than improvising.
 *
 * The gate reads only `IResolvedDevelopmentPolicy`. There is no
 * environment variable, no forge lookup and no override argument: if the
 * behaviour is to change, the policy changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { IPolicyGateVerdict } from './policy-gate.interface';

export type { IPolicyGateVerdict } from './policy-gate.interface';

const ALLOWED: IPolicyGateVerdict = { allowed: true, reason: '' };

/** May this policy's work reach the integration branch via pull request? */
export const gateIntegration = (
	policy: IResolvedDevelopmentPolicy,
): IPolicyGateVerdict => {
	if (policy.integration.strategy !== 'pull-request') {
		return {
			allowed: false,
			reason: `integration.strategy is '${policy.integration.strategy}', so this project integrates without pull requests; the pull-request engine declines.`,
		};
	}
	if (!policy.integration.requiresPullRequest) {
		return {
			allowed: false,
			reason: 'integration.requiresPullRequest is false, so a candidate must not be forced through a pull request.',
		};
	}
	return ALLOWED;
};
