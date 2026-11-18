/**
 * unit-fence.service.ts — a unit that was taken over does not publish
 * over the one that took its work.
 *
 * Adopting a unit (`work claim`) gives the same slice a higher
 * generation. The agent that held it before may come back with its old
 * checkout intact and publish: a second pull request for work somebody
 * else now holds. The generation is the fence: a unit publishes only
 * while no higher generation of its slice exists.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { unitOfName } from '../development-policy/owned-work-ref-parser';
import { readGit } from './work-unit-shared.service';

/**
 * Among `refs`, the highest generation of the unit `workRef` names that
 * is higher than its own, with the ref that carries it. `undefined` when
 * `workRef` is the newest, or names no unit. Names are read by the one
 * parser, so both spellings of a generation count (f00808).
 */
export const supersedingUnit = (
	refs: readonly string[],
	workRef: string,
): { readonly generation: number; readonly ref: string } | undefined => {
	const own = unitOfName(workRef);
	if (own === undefined) return undefined;
	let newest: { generation: number; ref: string } | undefined;
	for (const ref of refs) {
		const other = unitOfName(ref);
		if (
			other === undefined ||
			other.kind !== own.kind ||
			other.proposal !== own.proposal ||
			other.slice !== own.slice ||
			other.generation <= own.generation
		) {
			continue;
		}
		if (newest === undefined || other.generation > newest.generation) {
			newest = { generation: other.generation, ref };
		}
	}
	return newest;
};

/** The same, over the work refs and publications this clone knows of. */
export const readSupersedingUnit = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	workRef: string,
): { readonly generation: number; readonly ref: string } | undefined => {
	const short = (prefix: string): string =>
		prefix.replace(/^(refs\/)?(heads\/)?/u, '');
	const patterns = [
		policy.branches.workRefPrefix,
		policy.branches.publicationRefPrefix,
	]
		.filter((prefix) => prefix.length > 0)
		.flatMap((prefix) => [
			`refs/heads/${short(prefix)}**`,
			`refs/remotes/**/${short(prefix)}**`,
		]);
	const listed =
		readGit(root, ['for-each-ref', '--format=%(refname)', ...patterns]) ??
		'';
	return supersedingUnit(
		listed.split('\n').filter((ref) => ref.length > 0),
		workRef,
	);
};
