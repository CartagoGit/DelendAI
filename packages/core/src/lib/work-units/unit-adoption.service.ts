/**
 * unit-adoption.service.ts — a unit entered for a proposal that did not
 * exist yet takes the proposal's id once it does.
 *
 * `work enter --kind=create --proposal=new` has to name the unit before the
 * allocator has handed out an id, so the unit is called after `new`. Its
 * pull request would then merge under a name that does not contain the
 * proposal it delivers, and every list that shows branches (the pull
 * requests, the swarm view) would say nothing about it. So when the id
 * exists the unit is renamed: same commit, same worktree, same lease, the
 * id in place of `new`. The name is rendered by the project's template,
 * never spelled here.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import { resolveWorkRef } from '../wip-engine/ref-name';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IAdoptedForgeBranch,
	IUnitAdoption,
} from '../contracts/interfaces/unit-adoption.interface';
import {
	readUnitLease,
	removeUnitLease,
	updateUnitLease,
} from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import { renameUnitRef } from './unit-ref-rename.service';
import { parseWorkSubject } from './work-ref-shape.service';
import { identityOf } from './work-swarm.service';
import { integrationRemote, readGit } from './work-unit-shared.service';

/** The proposal segment of a unit entered before its proposal existed. */
const UNALLOCATED_PROPOSAL = 'new';

/** Drop the forge's copy of the old name, when it has one. */
const dropForgeBranch = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
	branch: string,
): IAdoptedForgeBranch => {
	const remote = integrationRemote(cwd, policy);
	const listed = readGit(cwd, ['ls-remote', '--heads', remote, branch]);
	if (listed === undefined) return 'left';
	if (listed.length === 0) return 'absent';
	return readGit(cwd, ['push', '--quiet', remote, '--delete', branch]) ===
		undefined
		? 'left'
		: 'removed';
};

/** The lease follows the unit: it is keyed by the ref's name. */
const moveLease = async (
	cwd: string,
	from: string,
	to: string,
): Promise<boolean> => {
	const common = gitCommonDirOf(cwd);
	if (common === undefined) return false;
	const lease = await readUnitLease(common, from);
	if (lease === undefined) return false;
	await updateUnitLease(common, to, () => ({ ...lease, ref: to }));
	await removeUnitLease(common, from);
	return true;
};

/**
 * Give the unit `cwd` is a worktree of the id of `proposal`, when it was
 * entered for `new`. Anything else — a checkout that is no unit, a unit
 * that already carries an id — is left exactly as it is.
 */
export const adoptProposalId = async (input: {
	readonly cwd: string;
	readonly proposal: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): Promise<IUnitAdoption> => {
	const { cwd, proposal, policy } = input;
	const head = readGit(cwd, ['symbolic-ref', '--quiet', 'HEAD']);
	if (head === undefined) return { status: 'kept' };
	const branch = shortName(head);
	if (!branch.startsWith(shortName(policy.branches.workRefPrefix))) {
		return { status: 'kept' };
	}
	const { agent, subject } = identityOf(branch, policy);
	const parts = parseWorkSubject(policy.branches.workRefTemplate, subject);
	if (parts?.proposal !== UNALLOCATED_PROPOSAL) {
		return { status: 'kept', branch };
	}
	const to = shortName(
		resolveWorkRef(policy.branches.workRefTemplate, {
			agent,
			kind: parts.kind,
			proposal,
			slice: parts.slice,
			generation: Number(parts.generation),
			topic: parts.topic,
		}),
	);
	const sha = readGit(cwd, ['rev-parse', '--verify', head]);
	if (sha === undefined) {
		return {
			status: 'refused',
			branch,
			reason: `${branch} does not resolve to a commit, so it cannot be renamed.`,
		};
	}
	if (
		readGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${to}`])
	) {
		return {
			status: 'refused',
			branch,
			reason: `${to} already exists, so ${branch} cannot take that name.`,
		};
	}
	const renamed = renameUnitRef(cwd, { from: branch, to, sha });
	if ('reason' in renamed) {
		return { status: 'refused', branch, reason: renamed.reason };
	}
	const leaseMoved = await moveLease(cwd, branch, to);
	return {
		status: 'renamed',
		from: branch,
		to,
		leaseMoved,
		forge: dropForgeBranch(cwd, policy, branch),
	};
};
