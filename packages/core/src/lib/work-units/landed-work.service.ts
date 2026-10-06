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
	const lines = listed.split('\n').filter((line) => line.length > 0);
	if (lines.length === 0) return true;
	const beyond = new Set(lines.map((line) => line.split(' ')[0] ?? ''));
	return lines.every((line) => {
		const [, ...parents] = line.split(' ');
		return (
			parents.length > 1 &&
			parents.every(
				(parent) =>
					beyond.has(parent) ||
					readGit(root, [
						'merge-base',
						'--is-ancestor',
						parent,
						base,
					]) !== undefined,
			)
		);
	});
};
