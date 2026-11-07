/**
 * units-directory.constant.ts — where the units of work live.
 *
 * The folder of units is `<cacheDir>/.worktrees`: the cache root the
 * project declares, plus the one name under it. That is the same path
 * the proposals plugin builds (`buildSwarmPaths` → `worktreesDir`) and
 * the same one the eviction policy protects (`EVICTION_PROTECTED_PATHS`
 * names `.worktrees` under the cache root). One authority, three
 * readers.
 *
 * WHY it follows the cache root: a project that keeps its cache out of
 * the tree keeps its worktrees out of it too, and an editor watching
 * the tree stops seeing a checkout appear and disappear every time an
 * agent starts a unit. A constant pinned to `.cache/delendai/.worktrees`
 * ignored the project's own `cacheDir` and left the two authorities
 * disagreeing.
 */
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import { joinRel } from '../shared/paths';

/** The folder of units, under the cache root the project declares. */
export const UNITS_FOLDER = '.worktrees';

/** Where units live for a given cache root. */
export const unitsDirectoryFor = (cacheDir: string): string =>
	joinRel(cacheDir, UNITS_FOLDER);

/**
 * Where units live when the project declares no cache root of its own:
 * the default cache root, plus the folder of units.
 */
export const DEFAULT_UNITS_DIRECTORY = unitsDirectoryFor(
	DEFAULT_CORE_PATHS.cacheDir,
);

/** How deep a husk is searched for a checkout somebody left inside it. */
export const HUSK_SEARCH_DEPTH = 6;

/** The tree of a directory git would track nothing of. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
