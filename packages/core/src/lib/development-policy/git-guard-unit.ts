/**
 * git-guard-unit.ts — a unit of work has one ref.
 *
 * The work-ref template ends in a free `${topic}`, so
 * `…/x00799-all-g1/sim-a` is shaped exactly like the unit's real ref
 * `…/x00799-all-g1/derived-files-merge` and passed every shape rule. A
 * subagent used that to push scratch simulation refs to origin under its
 * unit's namespace, where the swarm, the reconciler and the next agent
 * read them as work. The shape cannot tell them apart; the unit can: it
 * was entered with one ref, and the lease names it.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IGitGuardVerdict,
	IUnitRefFacts,
} from '../contracts/interfaces/git-guard.interface';
import {
	compileOwnedWorkRefParser,
	ownedWorkRefShapeOf,
} from './owned-work-ref-parser';

const parsedWorkRef = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	branch: string,
) =>
	compileOwnedWorkRefParser(policy.branches, { requireKind: false })?.parse(
		`refs/heads/${branch}`,
	);

/** Who works on which proposal, as far as a work ref's name says. */
export const workUnitIdentityOf = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	branch: string,
): { readonly agent: string; readonly proposal: string } | undefined => {
	const identity = parsedWorkRef(policy, branch);
	return identity === undefined
		? undefined
		: { agent: identity.agent, proposal: identity.proposal };
};

/** The unit a work ref belongs to: everything its name says but the topic. */
export const workUnitKeyOf = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	branch: string,
): string | undefined => {
	const identity = parsedWorkRef(policy, branch);
	return identity === undefined
		? undefined
		: [
				identity.agent,
				identity.kind,
				identity.proposal,
				identity.slice,
				String(identity.generation),
			].join('/');
};

/**
 * Pushing a second ref into a unit that already has one. Undefined when
 * the ref is not in the work namespace, the unit is not known to hold
 * another ref, or this is the unit's ref.
 */
export const refuseSecondRefOfUnit = (
	policy: IResolvedDevelopmentPolicy,
	branch: string,
	unit: IUnitRefFacts | undefined,
): IGitGuardVerdict | undefined => {
	if (unit === undefined) return undefined;
	if (ownedWorkRefShapeOf(policy.branches, branch) === undefined)
		return undefined;
	const holder =
		unit.leasedRef !== undefined
			? unit.leasedRef !== branch
				? unit.leasedRef
				: undefined
			: unit.siblings.find((other) => other !== branch);
	if (holder === undefined) return undefined;
	return {
		refused: true,
		reason: `\`${branch}\` is a second ref in a unit that already has \`${holder}\`: a unit has one work ref, and anything else under its name reads as work to the swarm and the reconciler.`,
		remedy: "Commit in the unit's worktree and publish it (`delendai work publish`). Scratch refs and simulations belong in a local throwaway repository, not on the remote.",
	};
};
