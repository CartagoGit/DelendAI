/**
 * kept-unit-hydration.service.ts — a unit that holds nothing starts from
 * where the integration branch is now.
 *
 * A proposal in progress keeps its branch after each publication, so the
 * next slice continues on it. Once the publication merged, that branch
 * held nothing of its own and stayed where it was: entered again days
 * later, it handed its agent a tree dozens of commits behind, and the
 * slice written on it met the integration branch only at publish time,
 * as conflicts. Nine such units sat in one clone after a single run.
 *
 * A unit with no commit of its own has nothing to lose by moving. Entered
 * again, it is fast-forwarded to the integration base first. One that
 * holds commits, or uncommitted changes, is its agent's to bring forward.
 */
import { readGit } from './work-unit-shared.service';

/**
 * Fast-forward the unit at `path` to `base` when it holds nothing of its
 * own and is behind. Says so in the entry's answer, and nothing otherwise.
 */
export const hydratedIdleUnit = (
	root: string,
	path: string | undefined,
	ref: string,
	base: string,
): { readonly hydrated?: true } => {
	if (path === undefined) return {};
	const ahead = readGit(root, ['rev-list', '--count', `${base}..${ref}`]);
	const behind = readGit(root, ['rev-list', '--count', `${ref}..${base}`]);
	if (ahead !== '0' || behind === undefined || behind === '0') return {};
	if ((readGit(path, ['status', '--porcelain']) ?? 'dirty').length > 0) {
		return {};
	}
	// No hook: nothing was merged that the integration branch did not
	// already check, and a regeneration here would dirty an idle tree.
	const moved = readGit(path, [
		'-c',
		'core.hooksPath=/dev/null',
		'merge',
		'--ff-only',
		'--quiet',
		base,
	]);
	return moved === undefined ? {} : { hydrated: true };
};
