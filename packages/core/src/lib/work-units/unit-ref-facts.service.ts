/**
 * unit-ref-facts.service.ts — what the push guard needs to know about the
 * unit a pushed work ref belongs to: the other refs it already has, and
 * the one its lease names.
 */
import { unitKeyOf } from '../development-policy/git-guard-unit';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IUnitRefFacts } from '../contracts/interfaces/git-guard.interface';
import { listUnitLeases } from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import { listWorkRefs } from './work-swarm.service';

export const readUnitRefFacts = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): Promise<IUnitRefFacts | undefined> => {
	const key = unitKeyOf(policy, branch);
	if (key === undefined) return undefined;
	const siblings = [...listWorkRefs(root, policy).keys()].filter(
		(name) => name !== branch && unitKeyOf(policy, name) === key,
	);
	const common = gitCommonDirOf(root);
	const leases =
		common === undefined ? [] : [...(await listUnitLeases(common)).keys()];
	const leasedRef = leases.find((name) => unitKeyOf(policy, name) === key);
	return { siblings, ...(leasedRef === undefined ? {} : { leasedRef }) };
};
