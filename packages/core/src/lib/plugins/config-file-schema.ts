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
import z from 'zod';
import { DEVELOPMENT_CONFIG_SCHEMA } from './development-config-schema.constant';
import {
	AccountsSchema,
	AgentsSchema,
	CataloguesSchema,
	ClientsSchema,
	ModelProviders,
	PluginRegistry,
	PluginsSchema,
	ProvidersSchema,
} from './config-plugin-schema.constant';
import {
	CacheSchema,
	EvidenceSchema,
	LoopdetectorSchema,
	ManagedSurface,
	StartupReport,
	StateSchema,
} from './config-runtime-schema.constant';
import { COMMIT_AUTHOR_MODES } from '../contracts/interfaces/commit-author.interface';
import { MCP_TOOL_SURFACE_MODE } from '../contracts/interfaces/surface-mode.interface';
import { unknownAccountIssues } from './account-registry.helper';
import { documentedEnum } from './config-schema-docs';
import {
	COMMIT_AUTHOR_MODE_DOCS,
	SURFACE_MODE_DOCS,
} from '../contracts/constants/config-schema-docs.constant';

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
				'Where the server writes the documents a person reads and edits — the workflow files, the generated guides. Relative to the workspace root. Change it when the project keeps its documentation somewhere other than `docs/delendai`.',
			),
		surfaceMode: documentedEnum(MCP_TOOL_SURFACE_MODE, SURFACE_MODE_DOCS)
			.optional()
			.describe(
				'How much of the tool catalogue the MCP server lists to the model. Defaults to `managed`. Choose `native` when the host wants every tool up front, `compact` when context is scarce.',
			),
		startupReport: StartupReport,
		managedSurface: ManagedSurface,
		evidence: EvidenceSchema,
		state: StateSchema,
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
		plugins: PluginsSchema,
		pluginRegistry: PluginRegistry,
		providers: ProvidersSchema,
		clients: ClientsSchema,
		catalogues: CataloguesSchema,
		agents: AgentsSchema,
		modelProviders: ModelProviders,
		accounts: AccountsSchema,
		cache: CacheSchema,
		loopDetector: LoopdetectorSchema,
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
