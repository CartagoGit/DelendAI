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

/** A call whose argument builds repositories once per worker, not per case. */
const ONCE_PER_WORKER = 'createSharedGitFixture(';

/** `(` minus `)` on a line: how far it opens a call. */
const depthChange = (line: string): number =>
	(line.match(/\(/gu)?.length ?? 0) - (line.match(/\)/gu)?.length ?? 0);

/**
 * Lines in `text` that run `git init`, comments left out, and those inside a
 * `createSharedGitFixture(...)` builder too: that runs once per worker.
 */
export const countGitInits = (text: string): number => {
	let depth = 0;
	return text.split('\n').filter((line) => {
		const code = line.trim();
		const opens = code.includes(ONCE_PER_WORKER);
		const inBuilder = depth > 0 || opens;
		if (inBuilder) {
			const at = opens ? code.indexOf(ONCE_PER_WORKER) : 0;
			depth = Math.max(0, depth + depthChange(code.slice(at)));
		}
		if (inBuilder) return false;
		if (code.startsWith('//') || code.startsWith('*')) return false;
		return GIT_INIT.test(code);
	}).length;
};
