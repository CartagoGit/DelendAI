/**
 * config-file-schema.ts — Solid SRP extraction.
 *
 * `load-config-file.ts` was 264 lines, ~80 of which were a single
 * Zod schema (a data declaration with no behaviour). Extracting the
 * schema into its own module:
 *
 *   - **SRP**: the schema is data, the parser/doctor is behaviour.
 *     The two now live in separate files that evolve independently.
 *   - **Re-export**: `load-config-file.ts` still exports
 *     `CONFIG_FILE_SCHEMA` so every existing import site keeps
 *     working. Consumers that only need the schema can import it
 *     from here directly.
 *   - **OCP**: future fields are added by editing the schema in one
 *     place, and the type-side interfaces (`IBootstrapPatternOverride`,
 *     etc.) live in `load-config-file.ts` next to their parser.
 *
 * The schema mirrors the composite `IDelendaiConfigFile` shape
 * exactly — `.strict()` everywhere so a typo in the config file is
 * reported as a schema violation instead of being silently ignored.
 */
import { DECLARED_PROVIDER_SCHEMA } from '../contracts/constants/declared-provider-schema.constant';
import { CATALOGUE_SOURCES_SCHEMA } from '../contracts/constants/catalogue-sources-schema.constant';
import { DECLARED_AGENT_SCHEMA } from '../contracts/constants/declared-agent-schema.constant';
import { KNOWN_CLIENT_SCHEMA } from '../contracts/constants/known-client-schema.constant';
import z from 'zod';
import { DEVELOPMENT_CONFIG_SCHEMA } from './development-config-schema.constant';
import { PRESET_KIND } from './preset-catalog';
import { PERMISSION_CATEGORIES } from '../contracts/constants/permission-categories.constant';
import { COMMIT_AUTHOR_MODES } from '../contracts/interfaces/commit-author.interface';
import { MCP_TOOL_SURFACE_MODE } from '../contracts/interfaces/surface-mode.interface';
import { STARTUP_REPORT_LEVEL_INPUTS } from '../startup-report/level';
import { accountIssues, unknownAccountIssues } from './account-registry.helper';
import {
	PROVIDER_ACCOUNT_SCHEMA,
	PROVIDER_ENTRY_SCHEMA,
} from '../contracts/constants/provider-entry-schema.constant';
import {
	CACHE_RUN_ON_BOOT_DOCS,
	COMMIT_AUTHOR_MODE_DOCS,
	EVIDENCE_CLEANUP_DOCS,
	MANAGED_SURFACE_LOADING_DOCS,
	PERMISSION_CATEGORY_DOCS,
	PLUGIN_ORIGIN_DOCS,
	PLUGIN_REGISTRY_DEFAULT_PRESET_DOCS,
	PLUGIN_REGISTRY_ORIGIN_DOCS,
	STARTUP_REPORT_COLOR_DOCS,
	STARTUP_REPORT_LEVEL_DOCS,
	SURFACE_MODE_DOCS,
	documentedEnum,
} from './config-schema-docs';

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

/** Structural schema for the config file (used by `--check`). */
export const CONFIG_FILE_SCHEMA = z
	.object({
		$schema: z
			.string()
			.optional()
			.describe(
				'Editor hint: the URL of the published JSON Schema for this file. Point your editor at it so it can autocomplete the legal values and flag a typo as you type.',
			),
		// The key that renames every tool; refused as unknown before, which
		// stopped every configuration transition.
		namespacePrefix: z
			.string()
			.regex(/^[a-z][a-z0-9_]*$/u)
			.optional()
			.describe(
				'The prefix that renames every tool this server registers — a tool becomes `<prefix>_<plugin>_<tool>`. Defaults to `delendai`; change it when two servers would otherwise claim the same tool names in one host, or when a project wants its own namespace.',
			),
		hosts: z
			.array(z.string().min(1))
			.optional() // absent: the hosts found
			.describe(
				'The editor and agent hosts this project uses, for example `copilot`, `claude` or `cursor`. Delendai writes agent files and instructions for exactly these hosts. Leave it out and the hosts found in the project are used.',
			),
		cacheDir: z
			.string()
			.optional()
			.describe(
				'Where the server keeps its caches — worktrees, indexes, generated artefacts. Relative to the workspace root. Move it when the cache grows past what fits on the default disk, or when the default directory is not writable.',
			),
		docsDir: z
			.string()
			.optional()
			.describe(
				'Where the server writes the documents a person reads and edits — proposals, generated guides. Relative to the workspace root. Change it when the project keeps its documentation somewhere other than `docs/delendai`.',
			),
		surfaceMode: documentedEnum(MCP_TOOL_SURFACE_MODE, SURFACE_MODE_DOCS)
			.optional()
			.describe(
				'How much of the tool catalogue the MCP server lists to the model. Defaults to `managed`. Choose `native` when the host wants every tool up front, `compact` when context is scarce.',
			),
		startupReport: z
			.object({
				level: documentedEnum(
					STARTUP_REPORT_LEVEL_INPUTS,
					STARTUP_REPORT_LEVEL_DOCS,
				)
					.optional()
					.describe(
						'How much of the startup report to print. Defaults to `medium` — the plugin table, the token accounting and the warnings. Raise it to `full` while chasing a slow or expensive boot, lower it to `off` to print nothing.',
					),
				color: documentedEnum(
					['auto', 'always', 'never'],
					STARTUP_REPORT_COLOR_DOCS,
				)
					.optional()
					.describe(
						'Whether the startup report is coloured. `auto` colours it only when the output is a terminal; set `never` when a CI log parses the output.',
					),
			})
			.strict()
			.optional()
			.describe(
				'The operator-facing report printed when the server starts: what loaded and what it cost. Use it to keep a noisy startup quiet, or to make it verbose while debugging a slow boot.',
			),
		managedSurface: z
			.object({
				loading: documentedEnum(
					['lazy', 'eager'],
					MANAGED_SURFACE_LOADING_DOCS,
				)
					.optional()
					.describe(
						'When a managed plugin is loaded. `lazy` loads it on first use, so startup is fast and the first call pays a small delay; `eager` loads everything at startup, which costs startup time but removes the delay. Change it when the first call must be as fast as the rest.',
					),
				// Read by `assemble.ts` and typed in `load-config-file.ts`, but
				// missing here — so a workspace that set it got a config
				// diagnostic for an option the runtime honours.
				progressiveDisclosure: z
					.boolean()
					.optional()
					.describe(
						'Let `native` mode hide the tools a plugin marks as contextual or administrative from `tools/list`, while keeping them callable through the router. Off by default, because a host that chose `native` may never call the router; turn it on to shrink the listed surface.',
					),
				idleTtlMs: z
					.number()
					.int()
					.nonnegative()
					.nullable()
					.optional()
					.describe(
						'How long (milliseconds) a plugin may sit unused before it leaves the warm set. `null` disables the bound, so a warm plugin stays warm for the whole session. Lower it to release memory sooner; raise it when plugins are evicted between calls.',
					),
				maxWarmPlugins: z
					.number()
					.int()
					.nonnegative()
					.nullable()
					.optional()
					.describe(
						'How many plugins may be warm at once; `null` means no limit. Lower it to cap the memory a long session holds, raise it when a busy session keeps evicting plugins it is about to need again.',
					),
				minWarmMs: z
					.number()
					.int()
					.nonnegative()
					.nullable()
					.optional()
					.describe(
						'How long (milliseconds) a freshly warmed plugin is protected from eviction by idle time or by the warm-set limit; `null` removes the floor. Use it when a plugin is expensive to load and the session must not thrash it.',
					),
			})
			.strict()
			.optional()
			.describe(
				'How the managed surface loads plugins and how long it keeps them warm. Use it to trade startup speed against the latency of the first call, or to cap the memory a long session holds.',
			),
		evidence: z
			.object({
				retentionDays: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe(
						'How many days of evidence to keep before it becomes eligible for removal. Defaults to 30. Lower it when the evidence store grows too large, raise it when a later investigation needs the older records.',
					),
				cleanup: documentedEnum(
					['on-boot', 'dry-run', 'off'],
					EVIDENCE_CLEANUP_DOCS,
				)
					.optional()
					.describe(
						'When expired evidence is swept. `on-boot` sweeps while the server starts, `dry-run` reports what would go without deleting anything, `off` never sweeps and the evidence accumulates until you remove it yourself.',
					),
			})
			.strict()
			.optional()
			.describe(
				'How long the runtime keeps the evidence it records — tool results, sweep reports — and when it sweeps. Use it to control how much the evidence store grows.',
			),
		// The state engine. `parity.shadow.enabled` (default off) runs the
		// SQLite driver beside the in-memory one and samples their parity.
		state: z
			.object({
				parity: z
					.object({
						shadow: z
							.object({
								enabled: z
									.boolean()
									.optional()
									.describe(
										'Run the SQLite driver beside the in-memory one and sample whether they agree, so a divergence shows up before it is trusted. Off by default — nothing loads the second driver unless you turn it on. Turn it on while changing the state engine.',
									),
							})
							.strict()
							.optional()
							.describe(
								'Runs the SQLite driver beside the in-memory one and samples whether the two agree.',
							),
					})
					.strict()
					.optional()
					.describe(
						'How the two state drivers are compared with each other.',
					),
			})
			.strict()
			.optional()
			.describe('How the state engine stores and checks its data.'),
		keepLegacy: z
			.boolean()
			.optional()
			.describe(
				'Keep the previous version of a scaffolded file instead of overwriting it: regeneration moves the old bytes under `legacy/` first. Off by default, so a fresh template wins. Turn it on when a person has edited the generated files and must not lose them.',
			),
		agentWorktree: z
			.boolean()
			.optional()
			.describe(
				'Whether an agent may run its work in a separate git worktree, so parallel agents do not collide in one checkout. Off by default. Turn it on for a project where several agents work at the same time; when a `development` block is present it is an input to that policy instead.',
			),
		development: DEVELOPMENT_CONFIG_SCHEMA,
		core: z
			.object({
				agentPolicy: z
					.object({
						autonomous: z
							.boolean()
							.optional()
							.describe(
								'Whether agents decide and carry on (`true`) or stop and ask the person first (`false`). Leave it out to keep the host’s own default.',
							),
						principles: z
							.array(z.string().min(1))
							.optional()
							.describe(
								'Rules the agents are told to follow, one sentence each — the project’s own working agreements, for example: never edit generated files, always run the lint before proposing. Use it to state what the project insists on.',
							),
					})
					.strict()
					.optional()
					.describe(
						'How this project’s agents are expected to work. The block is injected into the agent’s instructions, so it changes behaviour rather than tooling.',
					),
			})
			.strict()
			.optional()
			.describe('Core-owned runtime and agent policies.'),
		// S5 (L3 — feature flags): optional top-level feature
		// flags block. Default-off; see `docs/delendai/api/feature-flags.md`.
		// Per-plugin flags live under `plugins.<name>.options.featureFlags`.
		featureFlags: z
			.record(z.string(), z.boolean())
			.optional()
			.describe(
				'Named feature flags, each `true` or `false`. Every flag is off unless it is set here, so this block is how a project opts into unfinished behaviour. Use it while a feature is being trialled, and remove the entry once the behaviour is canonical.',
			),
		// S4 — operator-chosen source/conventions block.
		// The `init` command emits this when its S1 detector picks
		// a non-default `pluginPathsRoot` (e.g. `libs/` for Angular
		// or Nx, `packages/` for workspaces). Downstream tooling
		// (`tools/scripts/scaffold/create-plugin.script.ts`, host-entry resolver
		// hints) reads it instead of having to re-discover the
		// project's layout. The loader ignores it; the schema
		// accepts it for the strict-config validator.
		convention: z
			.object({
				pluginPathsRoot: z
					.string()
					.describe(
						'The directory that holds the project’s plugin sources — `packages/`, `libs/`, `apps/` and so on. Set it when the default guess is wrong, so a scaffolder writes new plugins where the project keeps them.',
					),
				sourceRoot: z
					.string()
					.describe(
						'The directory that holds the project’s own source code, for example `src`. Set it when the default guess is wrong, so tooling that looks for the sources finds them.',
					),
			})
			.strict()
			.optional()
			.describe(
				'The layout the project uses, as its own declaration. It saves downstream tooling from re-discovering where the sources and the plugins live.',
			),
		// U5 — native authorized-roots filesystem allowlist.
		// Extra absolute roots the operator authorizes for `fs_read` /
		// `fs_write` beyond the workspace root. Default `[]` (off): with
		// no entries the native fs tools keep their single-root,
		// reject-absolute behaviour. Authorization is explicit, durable
		// and reviewable because it lives in the committed config file.
		filesystem: z
			.object({
				authorizedRoots: z
					.array(z.string())
					.optional()
					.describe(
						'Extra roots the native `fs_read` / `fs_write` tools may reach, in addition to the workspace root; a relative entry is resolved against the workspace root. Empty by default, which keeps the tools confined to the project — add an entry only for a directory the agent genuinely needs.',
					),
			})
			.strict()
			.optional()
			.describe('What the native file tools may touch.'),
		commitAuthor: z
			.object({
				// The mode list is sourced from `commit-author.ts` so
				// the schema, the type and the resolver never drift.
				mode: documentedEnum(
					COMMIT_AUTHOR_MODES,
					COMMIT_AUTHOR_MODE_DOCS,
				)
					.optional()
					.describe(
						'Which author identity the commits carry. Defaults to `git`, which uses the repository’s own `user.name` / `user.email`; the other modes credit the agent, a fixed bot, or a named person.',
					),
				clientName: z
					.string()
					.optional()
					.describe(
						'The host that is driving the agent, for example `vscode-copilot` or `claude-code`. Read by the `agent` and `bot` modes, and used as the fallback name in `named`.',
					),
				modelName: z
					.string()
					.optional()
					.describe(
						'The model that is doing the work, for example `claude-opus-4`. Read by the `named` mode to record which model wrote the change.',
					),
				humanName: z
					.string()
					.optional()
					.describe(
						'The display name of the person behind the work. Only read in the `named` mode, where the commit names the person and annotates the model.',
					),
				humanEmail: z
					.string()
					.optional()
					.describe(
						'The email address of the person behind the work. Only read in the `named` mode.',
					),
			})
			.strict()
			.optional()
			.describe(
				'Who is credited as the author of the commits this project produces.',
			),
		validationMatrix: z
			.object({
				scopes: z
					.record(
						z.string(),
						z.array(
							z.object({
								command: z
									.string()
									.describe(
										'The command to run for this scope, exactly as a person would type it — for example `bun run test`.',
									),
								expect: z
									.string()
									.describe(
										'What a successful run of that command looks like, so the agent can tell a pass from a failure.',
									),
							}),
						),
					)
					.describe(
						'The gates, keyed by scope name (for example `full` or `tools`), each with the command to run and the outcome to expect.',
					),
			})
			.optional()
			.describe(
				'The quality gates of this project, by scope. The server reads them so an agent knows how to validate its work here instead of guessing the commands.',
			),
		plugins: z
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
			),
		pluginRegistry: z
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
			),
		// f00067a S1 — root-level provider roster for the multi-model
		// orchestrator (wiki/07). Optional + additive: a config without
		// it keeps validating. The canonical home is HERE so peer
		// plugins (usage-tracking, …) can read the roster without
		// coupling to the runner plugin, which today also accepts a
		// copy under `plugins.orchestrator-runner.options.providers`.
		providers: z
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
			),
		// The accounts the roster entries run on. Optional + additive: an
		// entry without \`accountId\` predates accounts and still validates.
		// Clients a project declares beside the built-in catalogue, merged
		// over it by command (a person's file can add its own).
		clients: z
			.array(KNOWN_CLIENT_SCHEMA)
			.optional()
			.describe(
				'Clients a project declares beside the built-in catalogue, merged over it by command. Use it for a vendor CLI the catalogue does not know yet.',
			),
		// Public catalogues of agents and models, read before the defaults.
		catalogues: CATALOGUE_SOURCES_SCHEMA.optional().describe(
			'Public catalogues of agents and models, read before the built-in defaults. Use it to follow a registry the project does not ship.',
		),
		// Agents the catalogues miss, or reached another way than they say.
		agents: z
			.array(DECLARED_AGENT_SCHEMA)
			.optional()
			.describe(
				'Agents the catalogues miss, or reached another way than they say. Use it to declare an agent this project uses that no registry lists.',
			),
		// Model providers in models.dev's shape: each replaces the
		// catalogue's entry of the same id.
		modelProviders: z
			.array(DECLARED_PROVIDER_SCHEMA)
			.optional()
			.describe(
				'Model providers in the shape models.dev publishes them, keyed by the same id as the catalogue entry each one replaces.',
			),
		accounts: z
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
			),
		// Cache eviction policy. Without this block the boot sweep applies
		// the owners' rules (`runOnBoot: 'apply'`); `'dry-run'` reports
		// without deleting, `'off'` skips it.
		cache: z
			.object({
				runOnBoot: documentedEnum(
					['dry-run', 'apply', 'off'],
					CACHE_RUN_ON_BOOT_DOCS,
				)
					.optional()
					.describe(
						'What the boot-time sweep does. `apply` removes what the cache owners’ rules say is expendable, `dry-run` reports without deleting anything, `off` skips the sweep entirely.',
					),
				evictionIntervalMs: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe(
						'The shortest time between two boot sweeps, in milliseconds. `0` (or absent) sweeps on every boot; set it to a day or more when the cache is large enough that a restart should not pay for another walk.',
					),
				maxAgeDays: z
					.number()
					.optional()
					.describe(
						'The upper cap, in days, applied to every age-based eviction rule. Defaults to 30. Lower it to keep the cache shorter-lived — it can shorten the built-in lifetimes but never lengthen them.',
					),
				worktrees: z
					.object({
						enabled: z
							.boolean()
							.optional()
							.describe(
								'Ignored. Kept so an older configuration still validates: work units are removed by the work-reap command, and the sweep never touches the worktree directory.',
							),
						keepLastN: z
							.number()
							.optional()
							.describe(
								'Ignored. Kept so an older configuration still validates.',
							),
					})
					.strict()
					.optional()
					.describe(
						'Accepted for compatibility and ignored: work units are removed by the work-reap command, and the sweep never touches the worktree directory.',
					),
			})
			.strict()
			.optional()
			.describe('How the cache under `cacheDir` is swept at start-up.'),
		loopDetector: z
			.object({
				enabled: z
					.boolean()
					.optional()
					.describe(
						'Whether the loop detector runs at all. Off means a stuck agent is never flagged.',
					),
				repeatThreshold: z
					.number()
					.optional()
					.describe(
						'How many times the same tool may be called in a row before the agent is treated as stuck. Defaults to 8 — high enough that a person’s repeated orientation calls are not flagged.',
					),
				nearRepeatThreshold: z
					.number()
					.optional()
					.describe(
						'How many calls to nearly the same tool (the same tool with different arguments) count as a loop. Defaults to 5, below the exact-repeat threshold so near-repeats are caught first.',
					),
				similarityThreshold: z
					.number()
					.optional()
					.describe(
						'How similar two calls must be, from 0 to 1, to count as near-repeats. Defaults to 0.9; lower it to catch calls that differ more.',
					),
				idleThreshold: z
					.number()
					.optional()
					.describe(
						'How many consecutive calls that do nothing are treated as a stall. Defaults to 3.',
					),
				noProgressThreshold: z
					.number()
					.optional()
					.describe(
						'How many consecutive rounds without a change to the work count as no progress. Defaults to 3; lower it to catch a stalled agent sooner.',
					),
				ringSize: z
					.number()
					.optional()
					.describe(
						'How many recent calls the detector keeps in memory to compare against. Defaults to 50. Raise it when the agent’s cycle is longer than the window.',
					),
				gitCheckTools: z
					.array(z.string())
					.optional()
					.describe(
						'The tools whose repeated use counts as a loop. Defaults to the file-editing tools, which is where a stuck agent spins; extend it when the agent stalls on another tool.',
					),
				handoffDir: z
					.string()
					.optional()
					.describe(
						'Where the detector writes the handoff note it leaves for a stuck agent. Relative to the workspace root; it defaults to a directory under `cacheDir`.',
					),
				handoffTtlDays: z
					.number()
					.optional()
					.describe(
						'How many days a handoff note is kept before it is swept. Defaults to 7.',
					),
				notifyOnDetect: z
					.boolean()
					.optional()
					.describe(
						'Whether the detector tells the person when it detects a loop. Turn it off in an unattended run, where the notification would only be noise.',
					),
				interactiveAgentPatterns: z
					.array(z.string())
					.optional()
					.describe(
						'Agents the detector must ignore, by name or wildcard. Defaults to the patterns a host reports its one user-facing session under (`*-default`, `default-*`, `host`, `interactive`), because a person legitimately repeats the same call. Set it to `[]` to watch every agent.',
					),
			})
			.strict()
			.optional()
			.describe(
				'How the server notices an agent that is stuck in a loop instead of making progress. Read by the proposals plugin; a project that does not use it never sees this.',
			),
		bootstrap: z
			.object({
				patternOverrides: z
					.record(
						z.string(),
						z.object({
							type: z
								.string()
								.describe(
									'The project type this pattern describes — for example `data-pipeline` for a repository of pipelines.',
								),
							describe: z
								.string()
								.describe(
									'One line describing the project type, shown where the pattern is offered.',
								),
							recommendedTools: z
								.array(
									z.object({
										name: z
											.string()
											.describe(
												'The name of a recommended tool, as the server registers it.',
											),
										description: z
											.string()
											.describe(
												'Why this tool is recommended for this project type.',
											),
									}),
								)
								.describe(
									'The tools the blueprint recommends for this project type.',
								),
							recommendedPlugins: z
								.array(z.string())
								.describe(
									'The plugins the blueprint recommends for this project type, by plugin id.',
								),
							knowledgeHints: z
								.array(z.string())
								.describe(
									'Things the agent should know about this project type — one piece of guidance per entry.',
								),
						}),
					)
					.optional()
					.describe(
						'Extra project patterns, keyed by pattern name. A pattern the project does not declare keeps the value from the built-in catalogue.',
					),
			})
			.strict()
			.optional()
			.describe(
				'What the bootstrap blueprint is told about this project, so it can recommend the right tools and plugins.',
			),
		// S1 (L1 — version pin): optional semver string pinning the
		// self-host agent to a specific published `@delendai/core`
		// version. When omitted, the lint treats the pin as the latest
		// published tag (`'latest-published'` sentinel). Strict semver
		// regex so typos surface at boot instead of during a session.
		coreVersion: z
			.string()
			.regex(
				/^(latest-published|\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?)$/,
				'must be a semver string (e.g. "1.2.3") or the sentinel "latest-published"',
			)
			.optional()
			.describe(
				"Pin the @delendai/core version this host is wired against. Default 'latest-published' uses the most recent published tag. Set to a specific semver (e.g. '0.4.0') to lock the host to that release.",
			),
	})
	.strict()
	.superRefine((config, ctx) => {
		const declared = new Set(
			(config.accounts ?? []).map((account) => account.accountId),
		);
		for (const issue of unknownAccountIssues(
			config.providers ?? [],
			declared,
		))
			ctx.addIssue({
				code: 'custom',
				path: [issue.block, issue.index, issue.field],
				message: issue.message,
			});
	});
