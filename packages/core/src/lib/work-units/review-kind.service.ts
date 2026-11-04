/**
 * review-kind.service.ts — a review is entered as a review, whatever the
 * model typed (x01032).
 *
 * A weaker model called `work enter` itself for a review batch and left
 * the kind at its default: its wip was `implement/batch-all-g1/work` while
 * its publication was `review/batch-all-g1/verdicts`, so the claim landed
 * in one unit and the verdicts in another. The kind of a unit that
 * reviews is not the reviewer's choice: it is derived from what is
 * entered, and a kind that contradicts it is refused with the command
 * that does it.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { readWorkspaceDocsDir } from './development-policy.service';
import { integratedDocumentPathOf } from './reviewed-proposal.service';
import { integrationBase, refused } from './work-unit-shared.service';

/** The proposal a review pack is entered on: one batch per reviewer. */
const REVIEW_BATCH = 'batch';

const REVIEW_NEXT =
	'delendai review next --agent=<you> (or the `work` tool: action "enter", kind "review", proposal "batch", slice "all")';

/** The arguments a review unit is entered with. */
const asReviewUnit = (args: readonly string[]): readonly string[] => [
	...args.filter((arg) => !/^--(?:kind|proposal|slice)(?:=|$)/u.test(arg)),
	'--kind=review',
	`--proposal=${REVIEW_BATCH}`,
	'--slice=all',
];

/**
 * The arguments to enter with, or the refusal. `kind` absent on a review
 * batch, or on a proposal waiting in review/, becomes a review unit; a
 * kind other than review on the batch is refused. An explicit kind on a
 * proposal in review/ stays the caller's: a fix after review is
 * implemented there, and independence is checked elsewhere.
 */
export const withReviewKind = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	args: readonly string[],
): Promise<{
	readonly args: readonly string[];
	readonly refusal?: IWorkUnitResult;
}> => {
	const proposal = scalarArg(args, 'proposal');
	if (proposal === undefined) return { args };
	const kind = scalarArg(args, 'kind');
	if (proposal === REVIEW_BATCH) {
		return kind === undefined || kind === 'review'
			? { args: asReviewUnit(args) }
			: {
					args,
					refusal: refused(
						`The batch is where a reviewer works, so it is a review unit, not \`${kind}\`.`,
						`Do not choose a kind: run ${REVIEW_NEXT}.`,
					),
				};
	}
	if (kind !== undefined) return { args };
	const base = integrationBase(root, policy);
	if (base === undefined) return { args };
	const path = integratedDocumentPathOf({
		root,
		base,
		docsDir: await readWorkspaceDocsDir(root),
		proposal,
	});
	return path !== undefined && path.split('/').includes('review')
		? { args: asReviewUnit(args) }
		: { args };
};
