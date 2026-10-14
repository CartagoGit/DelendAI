/**
 * unit-edits-kept.service.ts — what an abandoned unit never committed is
 * kept on the forge, so the unit can leave the clone without losing it.
 *
 * The reaper used to leave such a unit where it was, reported with the
 * paths, for its owner to come back to. An owner whose lease ran out
 * hours ago does not come back: the worktree stayed, a full copy of the
 * repository, in every listing of the swarm as a unit at work. Its edits
 * are a tree like any other; kept as a commit under the retired refs they
 * are as recoverable as before, and nothing is left behind here.
 */
import { planRetirement } from './work-retire.service';
import { readGit } from './work-unit-shared.service';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

/** How much of the commit names the ref its edits are kept under. */
const SHORT_COMMIT_LENGTH = 12;

/**
 * Commit the worktree as it stands — tracked or not, never what git
 * ignores — on top of the unit's tip, and push it under the retired refs.
 * Returns the ref it is kept at, or nothing when it could not be kept;
 * the caller removes the unit only on a ref.
 */
export const keepUncommittedEdits = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly ref: string;
	readonly worktree: string;
}): string | undefined => {
	const { root, policy, remote, ref, worktree } = input;
	const plan = planRetirement({
		branch: ref,
		namespace: policy.branches.namespacePrefix,
		workRefPrefix: policy.branches.workRefPrefix,
		publicationRefPrefix: policy.branches.publicationRefPrefix,
	});
	if (plan === undefined) return undefined;
	if (readGit(worktree, ['add', '-A']) === undefined) return undefined;
	const tree = readGit(worktree, ['write-tree']);
	const tip = readGit(worktree, ['rev-parse', '-q', '--verify', 'HEAD']);
	if (tree === undefined || tip === undefined) return undefined;
	const commit = readGit(worktree, [
		'commit-tree',
		tree,
		'-p',
		tip,
		'-m',
		`kept by work reap: what ${plan.unit} left uncommitted`,
	]);
	if (commit === undefined || commit.length === 0) return undefined;
	const keptAt = `${plan.retiredRef}-${commit.slice(0, SHORT_COMMIT_LENGTH)}`;
	return readGit(root, [
		'push',
		'--quiet',
		'--',
		remote,
		`${commit}:${keptAt}`,
	]) === undefined
		? undefined
		: keptAt;
};
