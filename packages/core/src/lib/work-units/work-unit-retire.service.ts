import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import type { IRetirementOutcome } from '../contracts/interfaces/work-retire.interface';
import { scalarArg } from './command-args.helper';
import { planRetirement, restoreAdvice } from './work-retire.service';

import {
	forgeCli,
	integrationRemote,
	mainWorktreeOf,
	openWork,
	readGit,
	refused,
} from './work-unit-shared.service';

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
			'work retire --ref=<its work or publication branch> --reason="<why>" [--with-worktree]. `work swarm` lists the units there are.',
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
	const worktree = worktreeOn(root, plan.workBranch);
	if (worktree !== undefined) {
		if ((readGit(worktree, ['status', '--porcelain']) ?? '').length > 0) {
			return refused(
				`\`${plan.unit}\` has uncommitted changes in ${worktree}.`,
				'Commit them there, so the retired ref keeps them, then retire the unit again.',
			);
		}
		if (!args.includes('--with-worktree')) {
			return refused(
				`\`${plan.unit}\` has a worktree at ${worktree}: something may be working in it.`,
				'If it is yours or nobody’s, pass --with-worktree and the worktree is removed with the unit.',
			);
		}
	}
	// Every distinct tip is kept: the forge's and the clone's can differ,
	// and neither is known to be the one worth having.
	const distinct = [...new Set(found.map((tip) => tip.commit))];
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
	const pushed = readGit(root, [
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
	const restore = restoreAdvice(remote, plan.retiredRef);
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
