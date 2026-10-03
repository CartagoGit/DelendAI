/**
 * repo-authorities.constant.ts — this repository's own build facts.
 *
 * Every copy below is written by a `gen:all` step, from an authority that
 * is edited by hand. They live here rather than in core because their
 * producers are this repository's scripts: an adopting project has none
 * of them, so declaring them in the product would name producers that do
 * not exist. A plugin's product facts are declared in its manifest.
 *
 * Validated by the same rules as a manifest's `authorities`
 * (`parseAuthorityDeclarations`), and rendered to AUTHORITIES.md.
 */
import type { IAuthorityDeclaration } from '@delendai/core/public';

const GEN_ALL = 'bun run gen:all';

export const REPO_AUTHORITIES: readonly IAuthorityDeclaration[] = [
	{
		domain: 'plugin-manifests',
		authority: 'plugins/*/plugin.manifest.ts',
		projections: [
			{
				path: 'docs/delendai/generated/plugin-manifests.generated.json',
				producer: 'tools/scripts/generate/from-manifests.script.ts',
			},
			{
				path: 'docs/delendai/generated/plugin-manifests.generated.md',
				producer: 'tools/scripts/generate/from-manifests.script.ts',
			},
			{
				path: 'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts',
				producer: 'tools/scripts/generate/from-manifests.script.ts',
			},
			{
				path: 'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
				producer: 'tools/scripts/generate/from-manifests.script.ts',
			},
			{
				path: 'apps/web/src/data/plugins/catalog.generated.ts',
				producer: 'tools/scripts/generate/from-manifests.script.ts',
			},
			{
				path: 'packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts',
				producer:
					'tools/scripts/generate/managed-lazy-catalog.script.ts',
			},
			{
				path: 'docs/delendai/generated/plugin-catalog.generated.md',
				producer: 'tools/scripts/docs/generate-catalog.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'gen:all:check',
	},
	{
		domain: 'bundled-skills',
		authority: 'packages/core/skills/manifest.json',
		projections: [
			{
				path: 'packages/cli/src/lib/init/init-skill-inventory.generated.ts',
				producer: 'tools/scripts/gen/init-skill-inventory.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'gen:all:check',
	},
	{
		domain: 'config-schema',
		authority: 'packages/core/src/lib/plugins/config-file-schema.ts',
		projections: [
			{
				path: 'packages/core/schema/delendai.config.schema.json',
				producer:
					'tools/scripts/types/generate-config-schema.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'gen:all:check',
	},
	{
		domain: 'catalog-wire-cost',
		// Measured, not edited: the bytes the running server's tools/list
		// actually sends.
		authority: 'measurement:tools/list',
		projections: [
			{
				path: 'docs/delendai/TOKEN-BUDGETS.md',
				producer:
					'tools/scripts/report/token-budget-dashboard.script.ts',
			},
			{
				path: 'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts',
				producer: 'tools/scripts/generate/preset-metadata.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'tokens:dashboard:check',
	},
	{
		domain: 'observability-provenance',
		authority: 'plugins/observability/plugin.manifest.ts',
		projections: [
			{
				path: 'docs/delendai/generated/observability-provenance.generated.md',
				producer: 'tools/scripts/gen/provenance-truth.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'gen:all:check',
	},
	{
		domain: 'agent-catalog',
		authority: 'docs/delendai/proposals',
		projections: [
			{
				path: 'docs/delendai/agent-catalog.generated.json',
				producer:
					'tools/scripts/catalog/generate-agent-catalog.script.ts',
			},
			{
				path: 'docs/delendai/host-hints/agent-instructions.generated.md',
				producer: 'tools/scripts/catalog/render-host-hints.script.ts',
			},
		],
		rebuild: GEN_ALL,
		driftGate: 'catalog:check',
	},
];
