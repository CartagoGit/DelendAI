/**
 * work-unit-abandon.service.ts — the explicit end of a unit nobody will
 * publish.
 *
 * A unit ends in `work publish` or here. Deleting its branch by hand
 * loses the only copy of its commits, so the tip is kept first, as a tag
 * that names the unit and the commit; then the worktree, the local
 * branch, the remote copy and the lease go.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { ABANDONED_TAG_NAMESPACE } from './unit-lease.constant';
import { gitCommonDirOf } from './unit-lease.service';
import { removeUnitCheckout } from './unit-removal.service';
import { readUnitStandings } from './unit-standings.service';
import { readUnitLease } from './unit-lease.store';
import {
	agentFor,
	integrationRemote,
	openWork,
	readGit,
	refused,
	sessionFor,
} from './work-unit-shared.service';
import { existingWorkRef } from './work-unit-generation.service';

const shortRef = (ref: string): string => ref.replace(/^refs\/heads\//u, '');

export const abandoned = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy } = opened;
	const agent = agentFor(args);
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const given = scalarArg(args, 'ref');
	const ref =
		given !== undefined
			? shortRef(given)
			: proposal !== undefined && slice !== undefined && agent.length > 0
				? shortRef(
						existingWorkRef(
							root,
							args,
							policy,
							agent,
							proposal,
							slice,
						),
					)
				: undefined;
	if (ref === undefined) {
		return refused(
			'Say which unit to abandon.',
			'work abandon --ref=<work ref> [--force], or --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>].',
		);
	}
	const standing = (await readUnitStandings({ root, policy })).find(
		(entry) => entry.ref === ref,
	);
	if (standing === undefined) {
		return refused(
			`\`${ref}\` is not a unit of work in this clone.`,
			'List them with `delendai work swarm`.',
		);
	}
	const common = gitCommonDirOf(root);
	const lease =
		common === undefined ? undefined : await readUnitLease(common, ref);
	const session = sessionFor(args);
	const isOwner =
		lease !== undefined &&
		lease.owner.agent === agent &&
		(lease.owner.session === null || lease.owner.session === session);
	const ended =
		standing.standing === 'abandoned' || standing.standing === 'delivered';
	if (!ended && !(args.includes('--force') && isOwner)) {
		return refused(
			`\`${ref}\` is ${standing.standing}: ${standing.reason}.`,
			standing.standing === 'live' || standing.standing === 'idle'
				? "Only its owner can end it before it is abandoned: run this with the owner's --agent and --session and --force; otherwise resume it with `delendai work enter`, or wait."
				: 'Nothing to do.',
		);
	}
	const tip =
		readGit(root, ['rev-parse', '-q', '--verify', `refs/heads/${ref}`]) ??
		readGit(root, [
			'rev-parse',
			'-q',
			'--verify',
			`refs/remotes/${integrationRemote(root, policy)}/${ref}`,
		]);
	if (tip === undefined) {
		return refused(
			`\`${ref}\` has no tip in this clone.`,
			'Fetch it first.',
		);
	}
	const tag = `${ABANDONED_TAG_NAMESPACE}/${ref}-${tip.slice(0, 7)}`;
	if (readGit(root, ['tag', '-f', tag, tip]) === undefined) {
		return refused(
			`Could not keep the tip of \`${ref}\` as \`${tag}\`.`,
			'Nothing was removed.',
		);
	}
	const removal = await removeUnitCheckout(root, ref);
	if (removal.keptBecauseEdited.length > 0) {
		return refused(
			`The worktree of \`${ref}\` holds edits no commit has: ${removal.keptBecauseEdited.join(', ')}.`,
			'Commit them (the tip is kept as a tag anyway) or discard them yourself, then abandon again. Nothing was removed.',
		);
	}
	if (!removal.deletedBranch) {
		return refused(
			`Could not remove the worktree of \`${ref}\`.`,
			'Check `git worktree list`; the tip is kept as a tag and nothing else was removed.',
		);
	}
	const remote = integrationRemote(root, policy);
	const remoteCopy =
		readGit(root, [
			'rev-parse',
			'-q',
			'--verify',
			`refs/remotes/${remote}/${ref}`,
		]) !== undefined;
	const deletedRemote =
		remoteCopy &&
		readGit(root, ['push', remote, '--delete', ref]) !== undefined;
	return {
		code: EXIT_CODE.OK,
		data: {
			ref,
			standing: standing.standing,
			tip,
			keptAs: tag,
			removedWorktree: removal.removedWorktree,
			deletedLocalBranch: removal.deletedBranch,
			deletedRemoteBranch: deletedRemote,
			restore: `git branch <name> ${tag}`,
		},
	};
};
