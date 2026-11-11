/**
 * spec-git-init.helper.ts — a fast spec does not rebuild a repository per case.
 *
 * Outside the e2e tier a `git init` per case becomes
 * `createGitRepoTemplate` from `@delendai/test-kit`: built once per file,
 * copied per case. (Real waits are `no-sleep-in-specs`.)
 */

/** `git init` as an argument list or a command line. */
const GIT_INIT = /['"]init['"]\s*,|\bgit init\b/u;

export const isE2eTier = (path: string): boolean =>
	/\.e2e\.spec\.[cm]?[jt]sx?$/u.test(path) || /(?:^|\/)e2e\//u.test(path);

export const isFastSpec = (path: string): boolean =>
	/\.spec\.[cm]?[jt]sx?$/u.test(path) && !isE2eTier(path);

/**
 * A module that specs import for their setup, outside the e2e tier: a
 * repository a helper builds per call is one each case builds. Before this,
 * `unit-repo.helper.ts` ran git init for every case of 14 spec files and the
 * rule never saw it.
 */
export const isFastTestSupport = (path: string): boolean =>
	/(?:^|\/)tests?\//u.test(path) &&
	/\.[cm]?[jt]sx?$/u.test(path) &&
	!/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path) &&
	!/(?:^|\/)fixtures?\//u.test(path) &&
	!isE2eTier(path) &&
	!/\.e2e\.[^/]*$/u.test(path);

/** Lines in `text` that run `git init`, comments left out. */
export const countGitInits = (text: string): number =>
	text.split('\n').filter((line) => {
		const code = line.trim();
		if (code.startsWith('//') || code.startsWith('*')) return false;
		return GIT_INIT.test(code);
	}).length;
