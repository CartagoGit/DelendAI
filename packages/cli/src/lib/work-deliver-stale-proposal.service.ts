/**
 * work-deliver-stale-proposal.service.ts — a moved proposal has one copy.
 *
 * The folder is the proposal's status. When a unit moved a proposal to
 * review/ while develop edited its ready/ (or in-progress/) copy, the
 * merged tree can hold both files, and the second copy keeps the pull
 * request DIRTY and trips proposal-uniqueness. Before the proof, the
 * copy in the earlier folder is removed and the removal committed: the
 * copy furthest along the lifecycle is the one kept.
 */
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';

const PROPOSALS_DIR = 'docs/delendai/proposals';
/** The forward lifecycle, earliest first (the folder is the status). */
const FOLDER_ORDER = ['ready', 'in-progress', 'review', 'done'] as const;

const rankOf = (path: string): number => {
	const folder = path.slice(PROPOSALS_DIR.length + 1).split('/')[0] ?? '';
	return FOLDER_ORDER.indexOf(folder as (typeof FOLDER_ORDER)[number]);
};

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The tracked copies that stand behind another copy of the same file, pure. */
export const staleProposalCopies = (
	paths: readonly string[],
): readonly string[] => {
	const byName = new Map<string, string[]>();
	for (const path of paths) {
		if (rankOf(path) < 0 || !path.endsWith('.md')) continue;
		const bucket = byName.get(baseOf(path)) ?? [];
		bucket.push(path);
		byName.set(baseOf(path), bucket);
	}
	const stale: string[] = [];
	for (const copies of byName.values()) {
		if (copies.length < 2) continue;
		const top = Math.max(...copies.map(rankOf));
		const kept = copies.filter((copy) => rankOf(copy) === top);
		// A tie is a human's choice: nothing is removed.
		if (kept.length > 1) continue;
		stale.push(...copies.filter((copy) => rankOf(copy) !== top));
	}
	return stale.sort();
};

/**
 * Remove and commit the stale copies in a checkout; the paths removed.
 * Throws nothing: a git failure leaves the tree as it was.
 */
export const dropStaleProposalCopies = (
	git: IGitInCheckout,
): readonly string[] => {
	const listed = git(['ls-files', '--', PROPOSALS_DIR]);
	if (!listed.ok) return [];
	const stale = staleProposalCopies(listed.out.split('\n'));
	if (stale.length === 0) return [];
	if (!git(['rm', '-q', '--', ...stale]).ok) return [];
	const subject = `chore(delendai): drop the stale copy of ${stale.map(baseOf).join(', ')}`;
	return git(['commit', '-q', '-m', subject, '--', ...stale]).ok ? stale : [];
};
