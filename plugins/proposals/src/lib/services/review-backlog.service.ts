/**
 * review-backlog.service.ts — the proposals waiting for review.
 */
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader, safeListDir } from '@delendai/core/public';

import type { IReviewBacklogEntry } from '../contracts/interfaces/review-queue.interface';
import { readFrontmatterField } from '../proposals/proposal-frontmatter-writer';

const readText = async (path: string): Promise<string | undefined> =>
	new SafeWorkspaceReader(dirname(path))
		.readText(basename(path))
		.then((value) => value.content)
		.catch(() => undefined);

/**
 * The proposals in review, read from the `review/` folder itself (x00732).
 *
 * The queue read the derived index, which a fresh clone, a unit's worktree
 * or a checkout where `sync` is refused does not have: a consumer
 * repository with two proposals in `review/` answered that nothing waited.
 * The folder is where a proposal in review is; its frontmatter names it.
 */
export const proposalsInReview = async (
	proposalsDirAbs: string,
): Promise<readonly IReviewBacklogEntry[]> => {
	const listed = await safeListDir(join(proposalsDirAbs, REVIEW_FOLDER));
	const names = listed.entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const entries = await Promise.all(
		names
			.filter((name) => name.endsWith('.md'))
			.map(async (name): Promise<IReviewBacklogEntry | undefined> => {
				const file = `${REVIEW_FOLDER}/${name}`;
				const markdown = await readText(join(proposalsDirAbs, file));
				if (markdown === undefined) return undefined;
				const id =
					readFrontmatterField(markdown, 'id') ??
					/^([a-z]\d{5})-/u.exec(name)?.[1];
				if (id === undefined) return undefined;
				const date = readFrontmatterField(markdown, 'date');
				return {
					id,
					file,
					status: 'review',
					...(date === undefined ? {} : { date }),
				};
			}),
	);
	return entries
		.filter((entry): entry is IReviewBacklogEntry => entry !== undefined)
		.sort(
			(left, right) =>
				(left.date ?? '').localeCompare(right.date ?? '') ||
				left.id.localeCompare(right.id),
		);
};

/** Where a proposal in review lives, under the proposals directory. */
const REVIEW_FOLDER = 'review';
