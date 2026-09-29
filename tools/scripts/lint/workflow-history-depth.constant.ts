/** Constants for `workflow-history-depth.script.ts`. */

/** Where the workflows live, relative to the repository root. */
export const WORKFLOWS_DIR = '.github/workflows';

/**
 * Commands that cannot answer correctly on a one-commit clone.
 *
 * Deliberately narrow: each of these needs a COMMON ANCESTOR, which a
 * shallow clone does not have. A plain `git status` or `git rev-parse
 * HEAD` is fine at any depth and is not listed — a rule that fired on
 * every job would be turned off.
 */
export const HISTORY_HUNGRY: readonly RegExp[] = [
	/git\s+merge\b(?!-file)/u,
	/git\s+merge-base\b/u,
	/git\s+rebase\b/u,
	/git\s+rev-list\b[^\n]*\.\./u,
	/git\s+log\b[^\n]*\.\./u,
	/git\s+diff\b[^\n]*\.\.\./u,
	/git\s+cherry\b/u,
	/--changed\s+\$/u,
	// The argv form. Scripts here do not write `git merge` as text; they
	// call `execFileSync('git', ['merge', …])` or a local `git([…])`
	// helper, so a text-only rule would have missed the very failure that
	// prompted this check — `forge:refresh` merging inside a shallow
	// clone. Anchored on the quoted subcommand so an unrelated word
	// `merge` in prose does not fire.
	/\[[^\]]{0,120}?['"]merge['"]\s*,/u,
	/['"]merge-base['"]/u,
	/\[[^\]]{0,120}?['"]rebase['"]\s*,/u,
];

/** Written in a job that genuinely does not need history, with the reason. */
export const WAIVER_MARKER = 'delendai:shallow-is-enough';
