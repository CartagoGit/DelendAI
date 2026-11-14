/**
 * land-batch-merge.helper.ts — a green batch lands only as the tree it was
 * tested as: the tree the merge would give is compared with the batch's
 * BEFORE anything is merged, and nothing merges otherwise.
 *
 * When the integration branch moved since the batch was built, only by what
 * the batch does not reach (the pass checked that), the trees differ by the
 * moved files, so the check is on the batch's footprint: the files the
 * members would change on the new tip equal the files the batch changed.
 */
import type {
	ILandBatchRecord,
	ILandDeps,
	ILandPullRequest,
} from './land.interface';

const sameFiles = (
	merged: ReadonlySet<string> | undefined,
	tested: ReadonlySet<string>,
): boolean =>
	merged !== undefined &&
	merged.size === tested.size &&
	[...merged].every((file) => tested.has(file));

/** Merge a green batch's members, or the batch itself with its regeneration; `in-flight` when a merge must wait for the next pass. */
export const mergeCertifiedBatch = async (input: {
	readonly deps: ILandDeps;
	readonly batch: ILandPullRequest;
	readonly record: ILandBatchRecord;
	readonly open: readonly {
		readonly recorded: string;
		readonly pr: ILandPullRequest;
	}[];
	readonly note: (line: string) => void;
	readonly landed: (number: number) => void;
}): Promise<'in-flight' | 'settled'> => {
	const { deps, batch, record, open, note, landed } = input;
	const { forge, git } = deps;
	const tested = git.treeOf(batch.headSha);
	const now = await forge.integrationTip();
	const riding = open.filter(({ pr, recorded }) => pr.headSha === recorded);
	// Nothing lands that was not tested: the tree the merge would give is
	// compared with the batch's BEFORE anything is merged.
	const members = riding.map(({ pr }) => ({
		number: pr.number,
		headRef: pr.headRef,
		headSha: pr.headSha,
	}));
	const certified = record.regenerated
		? now === record.tip
		: riding.length === open.length &&
			(git.mergedTree({ tip: now, members }) === tested ||
				(now !== record.tip &&
					sameFiles(
						git.mergedFiles({ tip: now, members }),
						git.landedSince(record.tip, batch.headSha).files,
					)));
	if (!certified) {
		await forge.comment(
			batch.number,
			'land: merging now would give a tree other than the tested one (a member moved, or the integration branch did). Nothing was merged; the batch is built again.',
		);
		note(
			`batch #${String(batch.number)}: not merged, the tree would differ from the tested one`,
		);
		return 'settled';
	}
	if (record.regenerated) {
		// A regeneration commit rides on the batch branch only, and the
		// forge cannot merge members that collide in a derived file one by
		// one: the batch itself lands, carrying every member's commits.
		const merged = await forge.merge(batch.number, batch.headSha);
		if (merged !== 'merged') {
			note(
				`batch #${String(batch.number)} not merged (${merged}): next pass`,
			);
			return 'in-flight';
		}
		for (const { pr } of open) {
			const after = await forge.pullRequest(pr.number);
			if (after.state !== 'open') continue;
			await forge.comment(
				pr.number,
				`land: landed in batch #${String(batch.number)}.`,
			);
			await forge.closePullRequest(pr.number);
		}
		landed(batch.number);
		note(`batch #${String(batch.number)} merged with its regeneration`);
	} else {
		for (const { pr, recorded } of riding) {
			const merged = await forge.merge(pr.number, recorded);
			if (merged !== 'merged') {
				note(`#${String(pr.number)} not merged (${merged}): next pass`);
				return 'in-flight';
			}
			landed(pr.number);
			note(
				`#${String(pr.number)} merged in batch #${String(batch.number)}`,
			);
		}
	}
	if (git.treeOf(await forge.integrationTip()) !== tested) {
		// Only a push between the check and the merge gets here.
		await forge.comment(
			batch.number,
			'land: the integration tree differs from the tested one: the branch moved during the merge. Nothing is reverted; the integration CI judges it.',
		);
		note(
			`batch #${String(batch.number)}: tree differs from the tested one`,
		);
	}
	return 'settled';
};
