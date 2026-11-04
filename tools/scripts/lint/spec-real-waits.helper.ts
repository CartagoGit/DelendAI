/**
 * spec-real-waits.helper.ts — what a fast spec may not do.
 *
 * Outside the e2e tier a spec stops waiting for real time and stops
 * rebuilding repositories, through `@delendai/test-kit`:
 *   - a real wait (`setTimeout(fn, 500)`, `sleep 2` in a shell gate,
 *     `Bun.sleep`) becomes `useFakeClock` / `stubAbortSignalTimeout` /
 *     `skipLockPauses`;
 *   - a `git init` per case becomes `createGitRepoTemplate`, built once
 *     per file and copied per case.
 */

/** A timer with a literal delay, or a shell `sleep` with a duration. */
const REAL_WAIT = /setTimeout\([^,()]+,\s*\d|\bsleep[ (]+\d|Bun\.sleep\(/u;

/** `git init` as an argument list or a command line. */
const GIT_INIT = /['"]init['"]\s*,|\bgit init\b/u;

export const isE2eTier = (path: string): boolean =>
	/\.e2e\.spec\.[cm]?[jt]sx?$/u.test(path) || /(?:^|\/)e2e\//u.test(path);

export const isFastSpec = (path: string): boolean =>
	/\.spec\.[cm]?[jt]sx?$/u.test(path) && !isE2eTier(path);

/** Lines in `text` that wait for real time or run `git init`. */
export const countSlowSetup = (text: string): number =>
	text.split('\n').filter((line) => {
		const code = line.trim();
		if (code.startsWith('//') || code.startsWith('*')) return false;
		return REAL_WAIT.test(code) || GIT_INIT.test(code);
	}).length;
