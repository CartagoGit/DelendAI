/**
 * eviction-protected-paths.helper.ts — what no eviction rule may name.
 *
 * The boot sweep applies the registered rules by default. A rule over
 * the units removed live worktrees, their uncommitted work with them;
 * one over the state directory could take the database's journal files.
 * Those have owners of their own, so a rule naming them is refused when
 * it is registered, not when it has already run.
 */
import { EVICTION_PROTECTED_PATHS } from '../contracts/constants/core-eviction.constant';

/** Throws when `path` (cache-relative, `dir/*` already reduced to `dir`) is, or is inside, a protected path. */
export const assertEvictable = (
	id: string,
	rulePath: string,
	path: string,
): void => {
	const first = path
		.split(/[\\/]/u)
		.find((segment) => segment.length > 0 && segment !== '.');
	const owned = EVICTION_PROTECTED_PATHS.find((root) => root === first);
	if (owned !== undefined)
		throw new Error(
			`cache eviction rule '${id}': '${owned}' is not eviction's to remove (${rulePath})`,
		);
};
