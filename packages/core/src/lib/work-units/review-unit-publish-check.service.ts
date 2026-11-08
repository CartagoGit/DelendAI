import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { deletedDocuments } from './review-pack-deletions.service';
import {
	describeCarriedPacks,
	otherReviewPacks,
	packsCarried,
} from './review-pack-scope.service';
import { outsideReviewScope } from '../development-policy/git-guard-review-scope';
import { readWorkspaceDocsDir } from './development-policy.service';
import { readSwarm } from './work-swarm.service';
import { readGit, refused } from './work-unit-shared.service';

/**
 * What stops a review unit from being published, or `undefined` when it
 * may be: a review records verdicts, nothing else (split from publish).
 */
export const reviewUnitRefusal = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly workRef: string;
	readonly base: string;
	readonly agent: string;
}): Promise<IWorkUnitResult | undefined> => {
	const { root, policy, workRef, base, agent } = input;
	const outside = outsideReviewScope(
		(
			readGit(root, [
				'diff',
				'--name-only',
				'--no-renames',
				`${base}...${workRef}`,
			]) ?? ''
		)
			.split('\n')
			.filter((path) => path.length > 0),
		await readWorkspaceDocsDir(root),
	);
	if (outside.length > 0) {
		return refused(
			`\`${workRef}\` is a unit that records verdicts, and it changes ${outside.join(', ')}: verdicts do not change the product.`,
			'Take those changes out of the unit (revert the commits that made them). A change the product needs is a proposal of its own, implemented in an `implement` unit.',
		);
	}
	const deleted = deletedDocuments(
		(
			readGit(root, [
				'diff',
				'--name-status',
				'--no-renames',
				`${base}...${workRef}`,
			]) ?? ''
		)
			.split('\n')
			.filter((line) => line.length > 0),
		await readWorkspaceDocsDir(root),
	);
	if (deleted.length > 0) {
		return refused(
			`\`${workRef}\` is a unit that records verdicts, and it deletes ${deleted.join(', ')}: a review moves a document, it never removes one.`,
			`Restore them from the integration branch (\`git checkout ${policy.branches.integration} -- ${deleted.join(' ')}\`), commit, and publish again.`,
		);
	}
	const commitsOver = (tip: string): readonly string[] =>
		(readGit(root, ['rev-list', '--no-merges', `${base}..${tip}`]) ?? '')
			.split('\n')
			.filter((commit) => commit.length > 0);
	const own = commitsOver(workRef);
	// Judged by what it changes, not by its commits: a claim is a commit
	// with no change, and a unit holding only a claim was published as a
	// pull request that delivered nothing and sat red in the queue.
	const changes =
		readGit(root, ['diff', '--name-only', `${base}...${workRef}`]) ?? '';
	if (own.length === 0 || changes.trim().length === 0) {
		return refused(
			`\`${workRef}\` records no verdict of its own: it changes nothing over \`${policy.branches.integration}\`.`,
			'There is nothing to publish. Record a verdict in this unit; a unit that will record none is removed with its worktree and its branch.',
		);
	}
	const swarm = readSwarm({ root, policy });
	const carried = packsCarried(
		own,
		otherReviewPacks([...swarm.units, ...swarm.published], agent).map(
			(pack) => ({ ref: pack.ref, commits: commitsOver(pack.tip) }),
		),
	);
	if (carried.length > 0) {
		return refused(
			`\`${workRef}\` carries another reviewer's pack: one verdict in two pull requests conflicts with itself when the first one lands.`,
			describeCarriedPacks(carried, policy.branches.integration),
		);
	}
	return undefined;
};
