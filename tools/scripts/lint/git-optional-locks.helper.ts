/**
 * git-optional-locks.helper.ts — what the git-optional-locks lint reads
 * out of a source file.
 *
 * A git read must not rewrite the index it reads, so every process that
 * starts git sets `GIT_OPTIONAL_LOCKS=0` once (the entries), and no
 * spawn replaces the environment with a bare object that drops it.
 */

/** A call that starts the real `git`. */
const GIT_SPAWN =
	/\b(?:execFileSync|execFile|spawnSync|spawn|Bun\.spawnSync|Bun\.spawn)\(\s*(?:\[\s*)?['"]git['"]/gu;

/** An `env: { … }` literal whose first level spreads nothing in. */
const BARE_ENV = /\benv:\s*\{(?![^{}]*\.\.\.)[^{}]*\}/u;

/** How far past a git spawn its options object is looked for. */
const OPTIONS_WINDOW = 400;

/** Whether the file starts git. */
export const spawnsGit = (source: string): boolean =>
	[...source.matchAll(GIT_SPAWN)].length > 0;

/**
 * Whether a call that starts git hands it an environment built from
 * nothing, so the process default never reaches it. Only the call's own
 * options are read: a helper's `env` option is merged over the seam's.
 */
export const dropsInheritedEnvironment = (source: string): boolean =>
	[...source.matchAll(GIT_SPAWN)].some((match) =>
		BARE_ENV.test(source.slice(match.index, match.index + OPTIONS_WINDOW)),
	);

/** Whether a process entry installs the default. */
export const installsOptionalLocksDefault = (source: string): boolean =>
	source.includes('applyGitOptionalLocksDefault(');
