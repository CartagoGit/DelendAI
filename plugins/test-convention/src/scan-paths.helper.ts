/**
 * scan-paths.helper.ts — which files a drift scan reads as specs and as
 * sources, and the names it matches them by.
 */

export const isSpec = (path: string, ext: string): boolean =>
	path.endsWith(`.${ext}`);

const SPEC_RE = /\.(?:spec|test)\.[cm]?[jt]sx?$/u;

/**
 * A source file: script code under any `src/` folder, the repository's
 * own or a package's (`packages/x/src/…`), never a declaration or a spec.
 */
export const isTsSource = (path: string): boolean =>
	/(?:^|\/)src\/.+\.[cm]?[jt]sx?$/u.test(path) &&
	!/\.d\.[cm]?ts$/u.test(path) &&
	!SPEC_RE.test(path);

/** A file's name without folders or extension: `src/a/b.tsx` → `b`. */
export const stemOf = (path: string): string =>
	(path.split('/').pop() ?? path).replace(/\.[^.]+$/u, '');

/** A spec's name without its spec suffix: `tests/b.spec.ts` → `b`. */
export const specStemOf = (path: string): string =>
	(path.split('/').pop() ?? path).replace(SPEC_RE, '');

/** Whether a path is named like a spec, in any test suffix. */
export const isSpecLikePath = (path: string): boolean => SPEC_RE.test(path);
