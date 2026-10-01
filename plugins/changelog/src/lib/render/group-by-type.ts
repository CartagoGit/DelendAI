import type { CommitType, IConventionalCommit } from './conventional-commit';

export interface IChangelogSection {
	readonly type: CommitType;
	readonly commits: readonly IConventionalCommit[];
}

const SECTION_ORDER: readonly CommitType[] = [
	'breaking',
	'feat',
	'fix',
	'docs',
	'refactor',
	'perf',
	'test',
	'build',
	'ci',
	'chore',
	'style',
	'revert',
	'other',
];

export const groupByType = (
	commits: readonly IConventionalCommit[],
): readonly IChangelogSection[] => {
	const buckets = new Map<CommitType, IConventionalCommit[]>();
	for (const commit of commits) {
		const type: CommitType = commit.breaking ? 'breaking' : commit.type;
		const existing = buckets.get(type);
		if (existing === undefined) {
			buckets.set(type, [commit]);
			continue;
		}
		existing.push(commit);
	}
	return SECTION_ORDER.flatMap((type) => {
		const sectionCommits = buckets.get(type);
		if (sectionCommits === undefined || sectionCommits.length === 0) {
			return [];
		}
		return [{ type, commits: sectionCommits }];
	});
};
