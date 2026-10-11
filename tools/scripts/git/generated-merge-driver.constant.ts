/**
 * Constants for `./generated-merge-driver`.
 *
 * Every entry here is a file NOBODY authors (or, for a `block`, a region
 * nobody authors). Adding one that a person edits by hand would discard
 * their work at merge time, so the bar for this table is not "it changes
 * often" but "its content is a function of the tree, and a generator
 * proves it". `gen-all` is the list of generators; the spec pins every
 * one of its steps to a rule here, so a generator added without a route
 * fails a test instead of reintroducing the conflicts.
 */

import type { IGeneratedMergeRule } from './generated-merge-driver.interface';

export const GENERATED_MERGE_RULES: readonly IGeneratedMergeRule[] = [
	{
		paths: [
			'docs/delendai/agent-catalog.generated.json',
			'docs/delendai/host-hints/agent-instructions.generated.md',
		],
		steps: ['agent-catalog', 'host-hints'],
		because:
			'the catalog is rendered from the proposals on disk, so any proposal that changes state moves it',
	},
	{
		paths: ['AGENT.md'],
		steps: ['agent-md'],
		because:
			'there are dozens of these, one per package and plugin, each rendered from that workspace, so two candidates touching different plugins still both rewrite the same set',
	},
	{
		paths: [
			'docs/delendai/generated/plugin-manifests.generated.json',
			'docs/delendai/generated/plugin-manifests.generated.md',
			'docs/delendai/security/permission-matrix.md',
			'docs/delendai/plugins/auto-generated/',
			'apps/web/src/data/plugins/catalog.generated.ts',
			'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
			'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts',
		],
		steps: ['plugin-manifests'],
		because:
			'every one of these is a projection of ALL plugin manifests at once, so a change to one plugin rewrites the file that describes the others',
	},
	{
		paths: ['docs/delendai/generated/plugin-catalog.generated.md'],
		steps: ['plugin-catalog-docs'],
		because: 'the plugin catalog page is a projection of every manifest',
	},
	{
		paths: ['/README.md'],
		steps: ['plugin-catalog-docs'],
		because:
			'the plugin table in the README is a projection of every manifest, and every plugin added edits it',
		block: {
			start: '<!-- BEGIN GENERATED: plugin-layout-table -->',
			end: '<!-- END GENERATED: plugin-layout-table -->',
		},
	},
	{
		paths: [
			'docs/delendai/generated/observability-provenance.generated.md',
		],
		steps: ['provenance-truth'],
		because: 'the provenance page is derived from the declared facts',
	},
	{
		paths: ['docs/delendai/security/capability-matrix.md'],
		steps: ['capability-matrix'],
		because:
			'the matrix is a projection of every plugin capability declaration together',
	},
	{
		paths: ['docs/delendai/CORE-PUBLIC-API-INVENTORY.md'],
		steps: ['core-public-inventory'],
		because:
			'the inventory counts and lists the whole public barrel, so any two candidates that export something both rewrite its totals',
	},
	{
		paths: ['docs/delendai/TOKEN-BUDGETS.md'],
		steps: ['token-budget-dashboard'],
		because:
			'the dashboard measures every tool, so a change to any one moves the rows and the totals of the others',
	},
	{
		paths: [
			'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts',
		],
		steps: ['preset-metadata'],
		because:
			'the preset metadata measures every preset against every plugin',
	},
	{
		paths: ['packages/core/schema/delendai.config.schema.json'],
		steps: ['config-schema'],
		because: 'the schema is rendered from the configuration contracts',
	},
	{
		paths: ['docs/delendai/api/stable.json'],
		steps: ['stable-manifest'],
		because: 'the stable facade manifest is rendered from the facade',
	},
	{
		paths: [
			'packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts',
		],
		steps: ['managed-lazy-catalog'],
		because: 'the lazy catalog is a projection of every plugin tool',
	},
	{
		paths: ['docs/delendai/AUTHORITIES.md'],
		steps: ['authorities'],
		because:
			'the authorities page is rendered from the declared authorities',
	},
	{
		paths: ['packages/cli/src/lib/init/init-skill-inventory.generated.ts'],
		steps: ['init-skill-inventory'],
		because: 'the inventory is rendered from the skill manifest',
	},
	{
		paths: ['src/generated/tool-outputs.ts'],
		steps: ['tool-types'],
		because:
			'the typed tool outputs of a package are rendered from every tool schema in it, so two candidates adding a tool to the same package both rewrite the file',
	},
	{
		paths: ['docs/delendai/README.md'],
		steps: ['docs-index'],
		because:
			'the guide index is rebuilt from the directory, so any two candidates adding a guide edit the same table',
		block: {
			start: '<!-- BEGIN GENERATED: docs-index -->',
			end: '<!-- END GENERATED: docs-index -->',
		},
	},
];
