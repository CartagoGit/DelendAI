/**
 * keep-one-proposal-copy.ts — where delendai merges, a proposal that two
 * branches moved is not left in two folders.
 *
 * WHY: git merges `ready/x.md` (a create pull request) and `review/x.md`
 * (the slices that moved it) without a conflict, because they are two
 * paths. The registry then refuses the duplicate id and every proposal
 * transition fails. The merge train, the candidate refresh and the
 * post-merge refresh all merge, so each calls this right after merging
 * and commits the result as a derived fix.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The subject of the commit that removes the stale copies. */
export const KEEP_ONE_COPY_SUBJECT =
	'chore(proposals): keep one copy of each duplicated proposal';

/** One copy removed: the path left behind and the one kept. */
export interface IRemovedProposalCopy {
	readonly id: string;
	readonly from: string;
	readonly kept: string;
}

/** Parse what the script printed; empty on anything unexpected. */
export const removedCopiesOf = (
	output: string,
): readonly IRemovedProposalCopy[] => {
	try {
		const parsed = JSON.parse(output.trim().split('\n').pop() ?? '') as {
			removed?: IRemovedProposalCopy[];
		};
		return parsed.removed ?? [];
	} catch {
		return [];
	}
};

/**
 * Remove the stale copies in `dir`, then `commit` the result with the
 * subject above. Returns what was removed; never throws (a merge that
 * cannot be reconciled is left as it was and the gates report it).
 */
export const keepOneProposalCopy = (
	dir: string,
	commit: (subject: string) => void,
	run: (dir: string) => string = (cwd) =>
		execFileSync(
			'bun',
			[
				join(
					dirname(fileURLToPath(import.meta.url)),
					'reconcile-duplicate-ids.script.ts',
				),
				'--root',
				cwd,
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		),
): readonly IRemovedProposalCopy[] => {
	let removed: readonly IRemovedProposalCopy[] = [];
	try {
		removed = removedCopiesOf(run(dir));
	} catch {
		return [];
	}
	if (removed.length > 0) commit(KEEP_ONE_COPY_SUBJECT);
	return removed;
};
