/**
 * changelog.interface.ts — types for `git_changelog` (conventional-commit
 * changelog + semver-bump inference). Kept under contracts/interfaces per the
 * types-in-contracts convention.
 */

/** The semver impact a set of commits implies. */
export type SemverBump = 'major' | 'minor' | 'patch' | 'none';

/** A single parsed conventional commit. */
export interface IConventionalCommit {
	readonly hash: string;
	/** Lowercased type, e.g. "feat", "fix", "chore". */
	readonly type: string;
	readonly scope?: string;
	readonly breaking: boolean;
	readonly subject: string;
}

/** One changelog entry (a commit rendered for a group). */
export interface IChangelogEntry {
	readonly hash: string;
	readonly scope?: string;
	readonly subject: string;
	readonly breaking: boolean;
}

/** Commits grouped under one conventional type. */
export interface IChangelogGroup {
	readonly type: string;
	readonly entries: readonly IChangelogEntry[];
}

/** The full changelog for a commit range. */
export interface IChangelog {
	readonly groups: readonly IChangelogGroup[];
	readonly bump: SemverBump;
	/** Total conventional commits parsed (non-conventional lines ignored). */
	readonly total: number;
}
