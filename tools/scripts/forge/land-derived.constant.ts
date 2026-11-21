import { REPO_AUTHORITIES } from '../gen/repo-authorities.constant';

/**
 * What runs in a batch's throwaway worktree after its members merged, as
 * `bun` arguments, in order: the dependencies from the merged lockfile,
 * then `gen:all`, the one list of every generator.
 *
 * No install scripts: the worktree is thrown away a minute later, and a
 * script that writes into the clone it belongs to leaves the clone
 * pointing at a directory that is gone.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'install --frozen-lockfile --ignore-scripts',
	'run gen:all',
];

/**
 * The files land may take from either side when they conflict: the
 * projections this repository declares as rebuilt by `gen:all`
 * (AUTHORITIES.md), which run right after the merge. Either side of such
 * a conflict is thrown away by the generator, so resolving it is not a
 * decision about intent. Any other conflicting file is, and stays with
 * its author.
 */
export const REGENERATED_PROJECTIONS: ReadonlySet<string> = new Set(
	REPO_AUTHORITIES.filter(
		(declaration) => declaration.rebuild === 'bun run gen:all',
	).flatMap((declaration) =>
		declaration.projections.map((projection) => projection.path),
	),
);
