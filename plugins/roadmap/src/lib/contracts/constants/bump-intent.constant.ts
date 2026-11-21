import type { CommitType } from '@delendai/changelog/public';

import type { IRoadmapEntryKind } from '../interfaces/roadmap.interface';

/**
 * Who owns the bump rule. Every payload that mentions a bump carries this,
 * so no consumer can read it as permission to write a version: the
 * release script derives the real one from the commits.
 */
export const ROADMAP_BUMP_AUTHORITY = '@delendai/changelog::inferBump';

/**
 * The conventional commit type that ships each kind of entry. A breaking
 * entry is a feature flagged as breaking when it becomes a commit.
 */
export const ROADMAP_KIND_COMMIT_TYPES: Readonly<
	Record<IRoadmapEntryKind, CommitType>
> = {
	breaking: 'feat',
	feature: 'feat',
	fix: 'fix',
	chore: 'chore',
};
