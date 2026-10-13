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
import { readGit } from './work-unit-shared.service';

/** `<kind>/<proposal>-<slice>-g<n>/<topic>` at the end of a work ref. */
const UNIT_OF_REF = /\/([^/]+)\/([^/]+)-g(\d+)\/[^/]+$/u;

const literal = (text: string): string =>
	text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Among `refs`, the highest generation of the unit `workRef` names that
 * is higher than its own, with the ref that carries it. `undefined` when
 * `workRef` is the newest, or names no unit.
 */
export const supersedingUnit = (
	refs: readonly string[],
	workRef: string,
): { readonly generation: number; readonly ref: string } | undefined => {
	const unit = UNIT_OF_REF.exec(workRef);
	if (unit === null) return undefined;
	const [, kind = '', slice = '', own = '0'] = unit;
	const sameUnit = new RegExp(
		`/${literal(kind)}/${literal(slice)}-g(\\d+)/[^/]+$`,
		'u',
	);
	let newest: { generation: number; ref: string } | undefined;
	for (const ref of refs) {
		const generation = Number(sameUnit.exec(ref)?.[1] ?? '0');
		if (generation <= Number(own)) continue;
		if (newest === undefined || generation > newest.generation) {
			newest = { generation, ref };
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
