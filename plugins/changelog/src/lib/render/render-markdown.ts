import type { IConventionalCommit } from './conventional-commit';
import type { IChangelogSection } from './group-by-type';

const SECTION_TITLES: Record<IChangelogSection['type'], string> = {
	breaking: 'BREAKING CHANGES',
	feat: 'Features',
	fix: 'Bug Fixes',
	docs: 'Documentation',
	refactor: 'Refactors',
	perf: 'Performance',
	test: 'Tests',
	build: 'Build System',
	ci: 'Continuous Integration',
	chore: 'Chores',
	style: 'Styles',
	revert: 'Reverts',
	other: 'Other Changes',
};

const renderCommit = (commit: IConventionalCommit): string =>
	commit.scope !== undefined && commit.scope.length > 0
		? `- **${commit.scope}**: ${commit.subject} (${commit.hash})`
		: `- ${commit.subject} (${commit.hash})`;

export const renderMarkdown = (
	sections: readonly IChangelogSection[],
): string =>
	sections
		.map((section) =>
			[
				`## ${SECTION_TITLES[section.type]}`,
				...section.commits.map(renderCommit),
			].join('\n'),
		)
		.join('\n\n')
		.trim();
