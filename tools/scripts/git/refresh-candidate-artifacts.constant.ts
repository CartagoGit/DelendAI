import { REPO_AUTHORITIES } from '../gen/repo-authorities.constant';

/**
 * What runs in a candidate's throwaway worktree after the merge, as `bun`
 * arguments, in order. The worktree starts with no dependencies, so it
 * installs them from the merged lockfile; then `gen:all`, the one list of
 * every generator. This used to be a second, shorter list (the catalog
 * and the quantitative block), which is how a candidate could come back
 * with every other derived file stale.
 */
export const GENERATED_REFRESH_COMMANDS: readonly string[] = [
	'install --frozen-lockfile',
	'run gen:all',
];

/**
 * The files a refresh may take from the integration branch when they
 * conflict: the projections this repository declares as rebuilt by
 * `gen:all` (AUTHORITIES.md), which the refresh runs right after the
 * merge. Either side of such a conflict is thrown away by the generator,
 * so resolving it is not a decision about intent. Any other conflicting
 * file still is, and stays with its author.
 */
export const REGENERATED_PROJECTIONS: ReadonlySet<string> = new Set(
	REPO_AUTHORITIES.filter(
		(declaration) => declaration.rebuild === 'bun run gen:all',
	).flatMap((declaration) =>
		declaration.projections.map((projection) => projection.path),
	),
);

/**
 * The subject of the commit a refresh adds when regeneration changed
 * something. Stated once: the refresh writes it, and the queue reads it to
 * tell a candidate it already regenerated from one it has not.
 */
export const REGENERATION_COMMIT_SUBJECT =
	'chore(generated): recompute after refreshing the candidate';
