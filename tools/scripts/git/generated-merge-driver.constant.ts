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
	{
		paths: ['AGENT.md'],
		command: 'gen:agent-md',
		because:
			'there are 68 of these, one per package and plugin, each rendered from that workspace — so any two candidates touching different plugins still both rewrite the same set',
	},
	{
		paths: [
			'docs/delendai/generated/plugin-manifests.generated.json',
			'docs/delendai/generated/plugin-manifests.generated.md',
			'docs/delendai/generated/plugin-catalog.generated.md',
			'docs/delendai/generated/observability-provenance.generated.md',
			'docs/delendai/security/permission-matrix.md',
			'docs/delendai/plugins/auto-generated/',
			'apps/web/src/data/plugins/catalog.generated.ts',
			'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
		],
		command: 'generate:from-manifests',
		because:
			'every one of these is a projection of ALL plugin manifests at once, so a change to one plugin rewrites the file that describes the others',
	},
	{
		paths: ['docs/delendai/security/capability-matrix.md'],
		command: 'generate:capability-matrix',
		because:
			'the matrix is a projection of every plugin capability declaration together',
	},
];
