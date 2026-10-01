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
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
import { shortName } from './git-guard-namespaces';

/** The unit a work ref belongs to: everything its name says but the topic. */
export const unitKeyOf = (
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	branch: string,
): string | undefined => {
	const parser = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
		{ requireKind: false },
	);
	const identity = parser?.parse(`refs/heads/${branch}`);
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
	const prefix = shortName(policy.branches.workRefPrefix);
	if (unit === undefined || prefix.length === 0) return undefined;
	if (!branch.startsWith(prefix)) return undefined;
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
		remedy: 'Commit in the unit and checkpoint or publish it (`delendai work checkpoint`, `delendai work publish`). Scratch refs and simulations belong in a local throwaway repository, not on the remote.',
	};
};
