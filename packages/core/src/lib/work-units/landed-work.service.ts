/**
 * landed-work.service.ts — whether a unit's tip carries anything the
 * integration branch lacks.
 *
 * Containment is the usual answer, and it misses one case that left
 * delivered units standing for good: the unit merged the integration
 * branch in after its work was taken by another publication. That merge
 * commit is the unit's only commit beyond the integration branch, and it
 * only joins two commits the integration branch already has.
 */
import { readGit } from './work-unit-shared.service';

/**
 * Of `git rev-list --parents <base>..<sha>`, the parents that must be in
 * the base for `sha` to carry nothing of its own, or `undefined` when a
 * commit beyond the base is not a merge (it is work). One reading for
 * every caller, whichever way it asks git about ancestry.
 */
export const parentsOutsideMerges = (
	listing: string,
): readonly string[] | undefined => {
	const lines = listing.split('\n').filter((line) => line.length > 0);
	const beyond = new Set(lines.map((line) => line.split(' ')[0] ?? ''));
	const outside = new Set<string>();
	for (const line of lines) {
		const [, ...parents] = line.split(' ');
		if (parents.length < 2) return undefined;
		for (const parent of parents) {
			if (!beyond.has(parent)) outside.add(parent);
		}
	}
	return [...outside];
};

/**
 * True when every commit `sha` holds beyond `base` is a merge whose
 * parents are in `base` or among those commits: nothing of its own.
 */
export const carriesNothingBeyond = (
	root: string,
	sha: string,
	base: string,
): boolean => {
	const listed = readGit(root, ['rev-list', '--parents', `${base}..${sha}`]);
	if (listed === undefined) return false;
	const outside = parentsOutsideMerges(listed);
	return (
		outside?.every(
			(parent) =>
				readGit(root, ['merge-base', '--is-ancestor', parent, base]) !==
				undefined,
		) ?? false
	);
};
