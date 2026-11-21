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
import type { IStaleDrop } from '../contracts/interfaces/stale-proposal-drop.interface';

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

/** The kept copy of a stale one: the same file name in the furthest folder. */
const keptOf = (stale: string, paths: readonly string[]): string =>
	paths
		.filter((path) => baseOf(path) === baseOf(stale))
		.sort((a, b) => rankOf(b) - rankOf(a))[0] ?? stale;

const blobOf = (git: IGitInCheckout, spec: string): string | undefined => {
	const parsed = git(['rev-parse', '--verify', '--quiet', spec]);
	return parsed.ok && parsed.out.length > 0 ? parsed.out : undefined;
};

/**
 * The blob the unit itself moved away: the stale path's content in the
 * parent of the commit in HEAD's history that deleted or renamed it.
 */
const movedAwayBlob = (
	git: IGitInCheckout,
	stale: string,
): string | undefined => {
	const moved = git([
		'log',
		'-1',
		'--format=%H',
		'--diff-filter=DR',
		'--',
		stale,
	]);
	return moved.ok && moved.out.length > 0
		? blobOf(git, `${moved.out}^:${stale}`)
		: undefined;
};

/**
 * A stale copy carries nothing the kept one lacks when its content is the
 * kept copy's, or is exactly what the unit moved away (nobody edited it
 * since, as develop does after the move).
 */
const carriesNothingElse = (
	git: IGitInCheckout,
	stale: string,
	kept: string,
): boolean => {
	const staleBlob = blobOf(git, `HEAD:${stale}`);
	if (staleBlob === undefined) return false;
	if (staleBlob === blobOf(git, `HEAD:${kept}`)) return true;
	return staleBlob === movedAwayBlob(git, stale);
};

/**
 * Remove and commit the stale copies in a checkout, only when each carries
 * nothing the kept copy lacks. Otherwise nothing is removed and the refusal
 * names both paths: edits are never discarded.
 */
export const dropStaleProposalCopies = (git: IGitInCheckout): IStaleDrop => {
	const listed = git(['ls-files', '--', PROPOSALS_DIR]);
	if (!listed.ok) return { dropped: [] };
	const paths = listed.out.split('\n');
	const stale = staleProposalCopies(paths);
	if (stale.length === 0) return { dropped: [] };
	const edited = stale.filter(
		(path) => !carriesNothingElse(git, path, keptOf(path, paths)),
	);
	if (edited.length > 0) {
		return {
			dropped: [],
			refusal: edited
				.map(
					(path) =>
						`${path} holds edits the kept copy lacks: carry the edits of ${path} into ${keptOf(path, paths)}, then deliver again`,
				)
				.join('\n'),
		};
	}
	if (!git(['rm', '-q', '--', ...stale]).ok) return { dropped: [] };
	const subject = `chore(delendai): drop the stale copy of ${stale.map(baseOf).join(', ')}`;
	return git(['commit', '-q', '-m', subject, '--', ...stale]).ok
		? { dropped: stale }
		: { dropped: [] };
};
