// ci-rules: declarative table for "which files signal which CI
// system?".
//
// SOLID — Open/Closed. The previous `detectCi` was a 5-branch `if`
// cascade in `analyze-project.ts`; adding a CI system meant editing
// that body. The table form lets you add a CI by appending one
// entry. The matcher is pure pipeline.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// `file evidence → CI system` mapping. The matcher that consumes
// the table lives next to the table; `analyze-project.ts` only
// calls `matchCi(reader)`.
//
// SOLID — Dependency Inversion. Hosts can inject their own
// `ICiRule[]` (e.g. a corporate CI that scans for an internal
// config file) without forking the core.

import type { IFileReader } from './analyze-project';

export interface ICiRule {
	/** The CI system id (e.g. `github-actions`). */
	readonly id: string;
	/** Path that, when present, signals this CI system. */
	readonly path: string;
	/**
	 * Optional discriminator: `dir` matches when the path is an
	 * existing directory with at least one entry; `file` (default)
	 * matches when the path exists as a file.
	 */
	readonly matchAs?: 'file' | 'dir';
	/** Earlier rules win. Use to break ties when multiple rules match. */
	readonly priority: number;
}

export const DEFAULT_CI_RULES: readonly ICiRule[] = [
	{
		id: 'github-actions',
		path: '.github/workflows',
		matchAs: 'dir',
		priority: 100,
	},
	{
		id: 'gitlab-ci',
		path: '.gitlab-ci.yml',
		priority: 90,
	},
	{
		id: 'azure-pipelines',
		path: 'azure-pipelines.yml',
		priority: 80,
	},
	{
		id: 'circleci',
		path: '.circleci/config.yml',
		priority: 70,
	},
	{
		id: 'jenkins',
		path: 'Jenkinsfile',
		priority: 60,
	},
];

/**
 * Pure: returns the list of CI systems detected for the given
 * workspace, in priority order. Allocation-free in the no-match
 * case (returns a frozen empty array).
 */
const EMPTY_RESULT: readonly string[] = Object.freeze([]);

export const matchCi = async (
	reader: IFileReader,
	rules: readonly ICiRule[] = DEFAULT_CI_RULES,
): Promise<readonly string[]> => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const out: string[] = [];
	for (const rule of sorted) {
		if (rule.matchAs === 'dir') {
			if ((await reader.listDir(rule.path)).length > 0) {
				out.push(rule.id);
			}
		} else if (await reader.exists(rule.path)) {
			out.push(rule.id);
		}
	}
	return out.length === 0 ? EMPTY_RESULT : out;
};
