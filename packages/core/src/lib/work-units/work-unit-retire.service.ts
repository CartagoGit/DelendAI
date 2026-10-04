import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import type { IRetirementOutcome } from '../contracts/interfaces/work-retire.interface';
import { scalarArg } from './command-args.helper';
import { releaseSlices } from './slice-reservation.service';
import { unitVerdictOf } from './unit-standings.service';
import { planRetirement, restoreAdvice } from './work-retire.service';

import {
	agentFor,
	forgeCli,
	integrationBase,
	integrationRemote,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

/** The caller's word that a unit with no lease is not somebody's. */
const assertsUnowned = (args: readonly string[]): boolean =>
	args.includes('--unowned') || args.includes('--with-worktree');

/** The worktree standing on `branch`, from `git worktree list --porcelain`. */
const worktreeOn = (root: string, branch: string): string | undefined =>
	(readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n\n')
		.find((block) => block.includes(`branch refs/heads/${branch}`))
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);

/** The open pull requests of `branch`, by number; none without a forge. */
const openPullRequestsOf = (root: string, branch: string): readonly number[] =>
	(
		forgeCli(root, [
			'pr',
			'list',
			'--head',
			branch,
			'--state',
			'open',
			'--json',
			'number',
			'--jq',
			'.[].number',
		]) ?? ''
	)
		.split('\n')
		.map((line) => Number(line.trim()))
		.filter((number) => Number.isInteger(number) && number > 0);

/**
 * Retire a unit that will not land: keep its tip on the forge under a
 * retired ref, then remove its branches. The order is the safety — a tip
 * that could not be kept leaves every branch where it was.
 */
export const retired = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { policy } = opened;
	const root = mainWorktreeOf(opened.root);
	const named = scalarArg(args, 'ref');
	const reason = scalarArg(args, 'reason');
	if (named === undefined || reason === undefined) {
		return refused(
			'Retiring a unit needs the unit and why it will not land.',
			'work retire --ref=<its work or publication branch> --reason="<why>" [--unowned]. `work swarm` lists the units there are.',
		);
	}
	const plan = planRetirement({
		branch: named,
		namespace: policy.branches.namespacePrefix,
		workRefPrefix: policy.branches.workRefPrefix,
		publicationRefPrefix: policy.branches.publicationRefPrefix,
	});
	if (plan === undefined) {
		return refused(
			`\`${named}\` is not a unit of work: it is under neither \`${policy.branches.workRefPrefix}\` nor \`${policy.branches.publicationRefPrefix}\`.`,
			'Only a work ref or a publication is retired; any other branch is not this command’s to remove.',
		);
	}
	const remote = ctx.globals.remote ?? integrationRemote(root, policy);
	const branches = [plan.workBranch, plan.publicationBranch];
	const tips = branches.flatMap((branch) => [
		{
			branch,
			where: 'here',
			commit: readGit(root, [
				'rev-parse',
				'-q',
				'--verify',
				`refs/heads/${branch}^{commit}`,
			]),
		},
		{
			branch,
			where: 'forge',
			commit: readGit(root, [
				'rev-parse',
				'-q',
				'--verify',
				`refs/remotes/${remote}/${branch}^{commit}`,
			]),
		},
	]);
	const found = tips.filter(
		(tip): tip is typeof tip & { commit: string } =>
			tip.commit !== undefined && tip.commit.length > 0,
	);
	if (found.length === 0) {
		return refused(
			`No branch of \`${plan.unit}\` exists here or on \`${remote}\`.`,
			`Fetch first (git fetch ${remote}), or check the name against \`work swarm\`.`,
		);
	}
	// Somebody in the unit keeps it: its lease says who, and how lately.
	// A unit older than leases is dated by its last commit, which names
	// nobody, so the caller has to say that it is not somebody's.
	const standing = await unitVerdictOf({ root, policy }, plan.workBranch);
	if (standing?.standing === 'live') {
		const owner = standing.owner?.agent;
		if (owner !== undefined && owner !== agentFor(args)) {
			return refused(
				`\`${plan.unit}\` is live: ${standing.reason}.`,
				`It is ${owner}'s to retire. Ask its owner, or retire it once it has gone quiet.`,
			);
		}
		if (owner === undefined && !assertsUnowned(args)) {
			return refused(
				`\`${plan.unit}\` may be somebody's: ${standing.reason}, and it has no lease to say whose.`,
				'If it is yours or nobody’s, pass --unowned and it is retired.',
			);
		}
	}
	const worktree = worktreeOn(root, plan.workBranch);
	let uncommitted: string | undefined;
	if (worktree !== undefined) {
		const dirty = (readGit(worktree, ['status', '--porcelain']) ?? '')
			.split('\n')
			.filter((line) => line.length > 0);
		const untracked = dirty
			.filter((line) => line.startsWith('??'))
			.map((line) => line.slice(3));
		if (untracked.length > 0) {
			return refused(
				`\`${plan.unit}\` has files git does not track in ${worktree}: ${untracked.slice(0, 5).join(', ')}.`,
				'Add and commit them there if they are work, or delete them if they are not, then retire the unit again: a retired ref can only keep what git holds.',
			);
		}
		// Changes to tracked files are kept too, as the commit git would
		// stash: retiring never asks a person to tidy a tree first.
		if (dirty.length > 0) {
			uncommitted = readGit(worktree, ['stash', 'create']);
			if (uncommitted === undefined || uncommitted.length === 0) {
				return refused(
					`Could not capture the uncommitted changes of \`${plan.unit}\` in ${worktree}.`,
					'Nothing was removed. Commit them there, then retire the unit again.',
				);
			}
		}
	}
	// Every distinct tip the integration branch lacks is kept: the forge's
	// and the clone's can differ, and neither is known to be the one worth
	// having. A tip the integration branch already holds needs no keeping.
	const base = integrationBase(root, policy);
	const delivered = (commit: string): boolean =>
		base !== undefined &&
		readGit(root, ['merge-base', '--is-ancestor', commit, base]) !==
			undefined;
	const distinct = [
		...new Set([
			...found
				.map((tip) => tip.commit)
				.filter((commit) => !delivered(commit)),
			...(uncommitted === undefined ? [] : [uncommitted]),
		]),
	];
	const kept = distinct.map((commit, index) => ({
		ref:
			index === 0
				? plan.retiredRef
				: `${plan.retiredRef}-${String(index + 1)}`,
		commit,
	}));
	for (const each of kept) {
		if (
			readGit(root, ['update-ref', each.ref, each.commit]) === undefined
		) {
			return refused(
				`Could not write ${each.ref}.`,
				'Nothing was removed.',
			);
		}
	}
	const pushed =
		kept.length === 0
			? ''
			: readGit(root, [
					'push',
					'--quiet',
					remote,
					...kept.map((each) => `${each.ref}:${each.ref}`),
				]);
	if (pushed === undefined) {
		return refused(
			`Could not keep \`${plan.unit}\` on \`${remote}\` (${kept.map((each) => each.ref).join(', ')}).`,
			'Nothing was removed: the unit is where it was. Check that the remote accepts the push, then retire it again.',
		);
	}
	const restore =
		kept.length === 0
			? `nothing to restore: \`${policy.branches.integration}\` already holds the unit's work`
			: restoreAdvice(remote, plan.retiredRef);
	const closed: number[] = [];
	for (const number of openPullRequestsOf(root, plan.publicationBranch)) {
		forgeCli(root, [
			'api',
			'-X',
			'POST',
			`repos/{owner}/{repo}/issues/${String(number)}/comments`,
			'-f',
			`body=Retired by \`delendai work retire\`: ${reason}\n\nIts work is kept at \`${plan.retiredRef}\` (\`${restore}\`).`,
		]);
		if (
			forgeCli(root, [
				'api',
				'-X',
				'PATCH',
				`repos/{owner}/{repo}/pulls/${String(number)}`,
				'-f',
				'state=closed',
			]) !== undefined
		) {
			closed.push(number);
		}
	}
	const removed: string[] = [];
	if (worktree !== undefined) {
		readGit(root, ['worktree', 'remove', '--force', worktree]);
	}
	for (const branch of branches) {
		const onForge = found.some(
			(tip) => tip.branch === branch && tip.where === 'forge',
		);
		if (
			onForge &&
			readGit(root, ['push', '--quiet', remote, '--delete', branch]) !==
				undefined
		) {
			removed.push(`${remote}/${branch}`);
		}
		if (
			found.some(
				(tip) => tip.branch === branch && tip.where === 'here',
			) &&
			readGit(root, ['branch', '-q', '-D', branch]) !== undefined
		) {
			removed.push(branch);
		}
	}
	// What the unit had reserved is free for the next agent.
	const implemented = /^[^/]+\/implement\/(?<proposal>[^-/]+)-/u.exec(
		plan.unit,
	)?.groups?.proposal;
	if (implemented !== undefined) {
		releaseSlices({
			root,
			remote,
			namespace: policy.branches.namespacePrefix,
			proposal: implemented,
			unit: plan.unit,
		});
	}
	const outcome: IRetirementOutcome = {
		unit: plan.unit,
		reason,
		kept,
		removed,
		closed,
		restore,
	};
	return { code: EXIT_CODE.OK, data: outcome };
};
