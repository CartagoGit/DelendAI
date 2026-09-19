/**
 * Constants for `./generated-merge-driver`.
 *
 * Every entry here is a file NOBODY authors. Adding one that a person
 * edits by hand would silently discard their work at merge time, so the
 * bar for this table is not "it changes often" but "its content is a
 * function of the tree, and a generator proves it".
 */

import type { IGeneratedMergeRule } from './generated-merge-driver.interface';

export const GENERATED_MERGE_RULES: readonly IGeneratedMergeRule[] = [
	{
		paths: ['docs/delendai/AGENT-BOOTSTRAP.md'],
		command: 'gen:quantitative',
		because:
			'the quantitative block is embedded by gen:quantitative and carries a timestamp and counters that move on every run',
	},
	{
		paths: [
			'docs/delendai/agent-catalog.generated.json',
			'docs/delendai/host-hints/agent-instructions.generated.md',
		],
		command: 'catalog:generate',
		because:
			'the catalog is rendered from the proposals on disk, so any proposal that changes state moves it',
	},
];
