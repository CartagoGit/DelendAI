/**
 * persistence-route.ts — turns the resolved development policy into ONE
 * of three answers about where a checkpoint goes, and refuses the
 * combinations this workspace cannot perform.
 *
 * WHY it is a separate, pure function: the engine's job is the pipeline,
 * not policy interpretation, and the single most dangerous mistake this
 * plugin could make is adopting the WIP model when nobody asked for it.
 * Written as a pure function over the policy, the rule can be pinned by
 * a spec for every profile — including "no policy at all" and "legacy
 * config" — instead of being inferred from an engine's end-to-end
 * behaviour.
 *
 * Precedence is deliberate and NOT symmetric: `allowsDirectIntegrationCommit`
 * is checked FIRST. Every legacy configuration and the `shared-direct`
 * profile set it, and the historical path must stay reachable even if a
 * future policy sets other axes alongside it. Absent policy means the
 * same thing — a programmatic host that never projected a policy has not
 * opted into a new model, and absence must never read as consent.
 *
 * The pinned-checkout refusal lives here because it is a ROUTING fact: a
 * policy that pins the checkout and still asks work to be persisted on a
 * checked-out branch is asking for a `switch`, which moves HEAD in a tree
 * other agents are editing. That is refused as structured data, never
 * thrown — the caller has to be able to name the offending axis.
 */

import {
	persistenceRouteKind,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

import type { IPersistenceRoute } from '../contracts/interfaces/persistence.interface';

import { HEAD_MOVING_GIT_VERBS } from './persistence-route.constant';

export type { IHeadMovingGitVerb } from './persistence-route.interface';
export { HEAD_MOVING_GIT_VERBS } from './persistence-route.constant';

/** True when `verb` would move HEAD in the visible checkout. */
export const movesHead = (verb: string): boolean =>
	(HEAD_MOVING_GIT_VERBS as readonly string[]).includes(verb);

/**
 * Guard one named operation against a pinned checkout. Returns the
 * structured refusal, or `undefined` when the operation is permitted.
 *
 * Exported so callers other than the router — a tool, a future restore
 * path — can ask the same question and get the same answer, rather than
 * each re-deriving "is this allowed?" from the policy.
 */
export const refuseIfMovesHead = (
	policy: IResolvedDevelopmentPolicy | undefined,
	operation: { readonly verb: string; readonly description: string },
):
	| {
			readonly code: 'PINNED_CHECKOUT';
			readonly reason: string;
			readonly remedy: string;
	  }
	| undefined => {
	if (policy === undefined) return undefined;
	if (!policy.workspace.pinnedCheckout) return undefined;
	if (!movesHead(operation.verb)) return undefined;
	return {
		code: 'PINNED_CHECKOUT',
		reason: `PINNED_CHECKOUT: ${operation.description} would run \`git ${operation.verb}\`, which moves HEAD in a checkout the policy pins (workspace.strategy=${policy.workspace.strategy}).`,
		remedy: 'Persist through the WIP ref engine, which never moves HEAD, or choose a profile whose workspace.pinnedCheckout is false (e.g. worktree-pr).',
	};
};

/** Decide where this workspace's checkpoints go. */
export const resolvePersistenceRoute = (
	policy: IResolvedDevelopmentPolicy | undefined,
): IPersistenceRoute => {
	if (policy === undefined) {
		return {
			kind: 'direct-commit',
			reason: 'no development policy on the plugin context; keeping the historical direct-commit behaviour',
		};
	}
	// The KIND comes from core's `persistenceRouteKind`, not from a
	// second reading of the same axes here. The startup check in
	// `validatePolicyAlignment` asks the same question, and two readings
	// of one policy is precisely the defect that check exists to catch —
	// so there is one answer and this module supplies the wording, the
	// pinned-checkout detail and the remedies around it.
	const kind = persistenceRouteKind(policy);
	if (kind === 'direct-commit') {
		return {
			kind: 'direct-commit',
			reason: `persistence.allowsDirectIntegrationCommit is true (profile ${policy.profile}, source ${policy.source})`,
		};
	}
	if (kind === 'wip-ref') {
		return {
			kind: 'wip-ref',
			reason: `persistence.usesWipRefs is true (profile ${policy.profile}, strategy ${policy.persistence.strategy})`,
		};
	}
	if (policy.persistence.usesWipRefs) {
		// `none` with WIP refs asked for can only mean one thing, and the
		// message names it rather than making the reader diff the axes.
		return {
			kind: 'refused',
			code: 'POLICY_ROUTE_UNSUPPORTED',
			reason: `POLICY_ROUTE_UNSUPPORTED: persistence.usesWipRefs is true but branches.workRefTemplate is empty, so no work ref can be named (profile ${policy.profile}).`,
			remedy: 'Set branches.workRefTemplate, e.g. `wip/${agent}/${proposal}-${slice}-g${generation}`.',
		};
	}
	// `branch` persistence in a pinned checkout is the case that has to be
	// refused rather than approximated: it wants a checked-out work branch
	// in a tree nobody may move.
	const pinned = refuseIfMovesHead(policy, {
		verb: 'switch',
		description: `persisting work on a checked-out branch (persistence.strategy=${policy.persistence.strategy})`,
	});
	if (pinned !== undefined) {
		return { kind: 'refused', ...pinned };
	}
	return {
		kind: 'refused',
		code: 'POLICY_ROUTE_UNSUPPORTED',
		reason: `POLICY_ROUTE_UNSUPPORTED: persistence.strategy=${policy.persistence.strategy} forbids direct integration commits and does not use WIP refs; commit-policy has no path for it.`,
		remedy: 'Use a profile whose persistence strategy is `direct-commit` or `wip-ref`, or persist through the worktree host instead of commit-policy.',
	};
};
