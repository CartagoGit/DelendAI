/**
 * config-plugin-schema.constant.ts — the blocks of `delendai.config.json`
 * that describe WHAT THIS PROJECT USES.
 *
 * The plugin map, the registry, the provider roster, the clients, the
 * catalogues, the agents and the accounts are one question — "what does
 * this project bring with it?" — and they were declared inside the config
 * file's own schema, where they pushed it past the point where a reader
 * could hold it in their head.
 *
 * Split out, the file that names the project stays about the project, and
 * this one is about what the project brings. The shape is unchanged: every
 * block here is the same schema, moved.
 */
import { z } from 'zod';

import { CATALOGUE_SOURCES_SCHEMA } from '../contracts/constants/catalogue-sources-schema.constant';
import { DECLARED_AGENT_SCHEMA } from '../contracts/constants/declared-agent-schema.constant';
import { KNOWN_CLIENT_SCHEMA } from '../contracts/constants/known-client-schema.constant';
import { DECLARED_PROVIDER_SCHEMA } from '../contracts/constants/declared-provider-schema.constant';
import {
	PROVIDER_ACCOUNT_SCHEMA,
	PROVIDER_ENTRY_SCHEMA,
} from '../contracts/constants/provider-entry-schema.constant';
import { PERMISSION_CATEGORIES } from '../contracts/constants/permission-categories.constant';
import { PRESET_KIND } from './preset-catalog';
import { accountIssues } from './account-registry.helper';
import { documentedEnum } from './config-schema-docs';
import {
	PERMISSION_CATEGORY_DOCS,
	PLUGIN_ORIGIN_DOCS,
	PLUGIN_REGISTRY_DEFAULT_PRESET_DOCS,
	PLUGIN_REGISTRY_ORIGIN_DOCS,
} from '../contracts/constants/config-schema-docs.constant';

const PLUGIN_REGISTRY_ENTRY_SCHEMA = z
	.object({
		id: z
			.string()
			.describe(
				"The plugin's stable kebab-case id — the same key it would have under `plugins` in this file.",
			),
		package: z
			.string()
			.describe(
				'The npm package the plugin is installed from, for example `@delendai/audit`.',
			),
		summary: z
			.string()
			.describe(
				'One line saying what the plugin does. Shown in the registry result list.',
			),
		tags: z
			.array(z.string())
			.describe(
				'Filter tags for the plugin, for example `security` or `perf`. A registry search that names tags returns only the entries carrying every tag asked for.',
			),
		origin: documentedEnum(
			['first-party', 'community'],
			PLUGIN_REGISTRY_ORIGIN_DOCS,
		).describe(
			'Who publishes the plugin. `first-party` is trusted by default; `community` is third-party code that runs with the project’s authority, so review it before installing it.',
		),
		permissions: documentedEnum(
			PERMISSION_CATEGORIES,
			PERMISSION_CATEGORY_DOCS,
		)
			.array()
			.optional()
			.describe(
				'The resource groups the plugin’s tools are allowed to touch. Declaring them is what lets the registry warn before an entry is adopted.',
			),
		// Accept the canonical preset ids + the legacy 'vertex' brand alias
		// (still valid input; resolvePresetMembers normalises it).
		defaultPreset: documentedEnum(
			[...PRESET_KIND, 'vertex'],
			PLUGIN_REGISTRY_DEFAULT_PRESET_DOCS,
		)
			.optional()
			.describe(
				'The preset this plugin belongs to — the group of plugins the server installs together. `vertex` is a legacy brand alias that resolves to `dogfood`.',
			),
	})
	.strict();

const PLUGIN_REGISTRY_SOURCE_SCHEMA = z
	.object({
		origin: z
			.literal('community')
			.describe(
				'Where every entry in this source came from. A community source can only carry community entries; the first-party index is bundled with the server.',
			),
		entries: z
			.array(PLUGIN_REGISTRY_ENTRY_SCHEMA)
			.describe('The plugins this source publishes.'),
	})
	.strict();

export const PluginsSchema = z
	.record(
		z.string(),
		z.object({
			enabled: z
				.boolean()
				.optional()
				.describe(
					'Force this plugin on or off. `false` suppresses it even when a preset or the command line selected it; `true` keeps it active. Leave it out to let the preset decide.',
				),
			origin: documentedEnum(
				['bundled', 'user-local', 'external'],
				PLUGIN_ORIGIN_DOCS,
			)
				.optional()
				.describe(
					'Where this plugin came from: shipped with the host, installed for one person, or written by somebody else. The activation UI records it here so a disabled entry still says what it was.',
				),
			prefix: z
				.string()
				.optional()
				.describe(
					'The namespace segment used in this plugin’s tool names. Change it when a tool name is already taken, or when the project wants shorter names.',
				),
			options: z
				.record(z.string(), z.unknown())
				.optional()
				.describe(
					'The plugin’s own settings, as plain JSON. The plugin reads them by name; the core passes them through without interpreting them.',
				),
			// S1: explicit module path for a local plugin.
			// Relative paths resolve against the workspace root;
			// absolute paths and `file:`/`./`/`/`-prefixed values
			// are forwarded verbatim to `loadPlugins`.
			path: z
				.string()
				.optional()
				.describe(
					'Where a local plugin’s module lives. A relative path is resolved against the workspace root; an absolute or `file:` path is used as written. Leave it out for a plugin that is installed normally.',
				),
		}),
	)
	.optional()
	.describe(
		'Per-plugin configuration, keyed by plugin id. Anything a plugin reads from its options belongs here.',
	);

export const PluginRegistry = z
	.object({
		communitySources: z
			.array(PLUGIN_REGISTRY_SOURCE_SCHEMA)
			.optional()
			.describe(
				'Community plugin lists this project wants the registry to search. Each source is a list of entries the project maintains itself.',
			),
	})
	.strict()
	.optional()
	.describe(
		'Extra plugin-registry sources, merged with the index the server ships.',
	);

// f00067a S1 — root-level provider roster for the multi-model
// orchestrator (wiki/07). Optional + additive: a config without
// it keeps validating. The canonical home is HERE so peer
// plugins (usage-tracking, …) can read the roster without
// coupling to the runner plugin, which today also accepts a
// copy under `plugins.orchestrator-runner.options.providers`.
export const ProvidersSchema = z
	.array(PROVIDER_ENTRY_SCHEMA)
	.superRefine((roster, ctx) => {
		const seen = new Set<string>();
		for (const [index, entry] of roster.entries()) {
			if (seen.has(entry.id)) {
				ctx.addIssue({
					code: 'custom',
					path: [index, 'id'],
					message: `duplicate provider id "${entry.id}"`,
				});
			}
			seen.add(entry.id);
		}
	})
	// `uniqueItems` is the JSON-Schema projection of the
	// unique-id refinement above (best effort: it compares
	// whole entries; the Zod side compares ids and is the
	// source of truth for `--check`).
	.meta({ uniqueItems: true })
	.optional()
	.describe(
		'The providers the multi-model orchestrator may reach, with how each one is invoked and what it is good at. Omit it to use only the built-in roster.',
	);

// The accounts the roster entries run on. Optional + additive: an
// entry without \`accountId\` predates accounts and still validates.
// Clients a project declares beside the built-in catalogue, merged
// over it by command (a person's file can add its own).
export const ClientsSchema = z
	.array(KNOWN_CLIENT_SCHEMA)
	.optional()
	.describe(
		'Clients a project declares beside the built-in catalogue, merged over it by command. Use it for a vendor CLI the catalogue does not know yet.',
	);

// Public catalogues of agents and models, read before the defaults.
export const CataloguesSchema = CATALOGUE_SOURCES_SCHEMA.optional().describe(
	'Public catalogues of agents and models, read before the built-in defaults. Use it to follow a registry the project does not ship.',
);

// Agents the catalogues miss, or reached another way than they say.
export const AgentsSchema = z
	.array(DECLARED_AGENT_SCHEMA)
	.optional()
	.describe(
		'Agents the catalogues miss, or reached another way than they say. Use it to declare an agent this project uses that no registry lists.',
	);

// Model providers in models.dev's shape: each replaces the
// catalogue's entry of the same id.
export const ModelProviders = z
	.array(DECLARED_PROVIDER_SCHEMA)
	.optional()
	.describe(
		'Model providers in the shape models.dev publishes them, keyed by the same id as the catalogue entry each one replaces.',
	);

export const AccountsSchema = z
	.array(PROVIDER_ACCOUNT_SCHEMA)
	.superRefine((accounts, ctx) => {
		for (const issue of accountIssues(accounts))
			ctx.addIssue({
				code: 'custom',
				path: [issue.index, issue.field],
				message: issue.message,
			});
	})
	.optional()
	.describe(
		'The accounts the roster entries run on. Each one names where a credential lives, never the credential itself.',
	);
