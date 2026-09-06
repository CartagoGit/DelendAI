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
import { PRESET_KIND } from './preset-catalog';
import { PERMISSION_CATEGORIES } from '../contracts/constants/permission-categories.constant';
import { COMMIT_AUTHOR_MODES } from '../contracts/interfaces/commit-author.interface';
import { MCP_TOOL_SURFACE_MODE } from '../contracts/interfaces/surface-mode.interface';
import { CAPABILITY_TAGS } from '../contracts/interfaces/provider-capabilities.interface';
import { STARTUP_REPORT_LEVEL_INPUTS } from '../startup-report/level';

/** Kebab-case provider id: `claude-sonnet`, `gpt-5-codex`, … */
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]+$/;

/**
 * f00067a S1 — how the orchestrator reaches a provider. Structural mirror
 * of `IProviderInvoke` (contracts/interfaces/provider-capabilities
 * .interface.ts): a discriminated union on `kind` so a config cannot mix,
 * e.g., an api `url` with a cli `command`. Kept field-for-field compatible
 * with the runner plugin's own `InvokeSchema`
 * (plugins/orchestrator-runner/src/lib/options.ts) so a roster is portable
 * between the root block and `plugins.orchestrator-runner.options`.
 */
const PROVIDER_INVOKE_SCHEMA = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('api'),
			url: z.string(),
			method: z.enum(['GET', 'POST']).optional(),
			envVar: z
				.string()
				.describe(
					'NAME of the environment variable holding the API key (e.g. "OPENAI_API_KEY"). Never put a literal secret here — the config file is committed.',
				),
		})
		.strict(),
	z
		.object({
			kind: z.literal('subscription'),
			// (F7): any non-empty id is accepted — core no longer
			// closes this to the hosts it happened to know about at
			// authoring time. orchestrator-runner owns validating it
			// against the hosts it can actually drive.
			tool: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal('cli'),
			command: z.string(),
			args: z.array(z.string()).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('mcp-server'),
			server: z.string(),
			tool: z.string(),
			args: z.record(z.string(), z.unknown()),
		})
		.strict(),
]);

/**
 * One provider in the roster — the config-file mirror of
 * `IProviderCapabilities`. Capability tags are sourced from
 * `CAPABILITY_TAGS` so the schema, the contract and the runner plugin
 * never drift.
 */
const PROVIDER_ENTRY_SCHEMA = z
	.object({
		id: z
			.string()
			.regex(PROVIDER_ID_PATTERN)
			.describe('Unique kebab-case provider id (e.g. "claude-sonnet").'),
		kind: z.enum(['api', 'subscription', 'cli', 'mcp-server']),
		invoke: PROVIDER_INVOKE_SCHEMA,
		modelId: z.string().min(1),
		contextWindow: z.number().int().nonnegative(),
		costTier: z.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		]),
		strengths: z.array(z.enum(CAPABILITY_TAGS)),
		weaknesses: z.array(z.enum(CAPABILITY_TAGS)),
	})
	.strict();

const PLUGIN_REGISTRY_ENTRY_SCHEMA = z
	.object({
		id: z.string(),
		package: z.string(),
		summary: z.string(),
		tags: z.array(z.string()),
		origin: z.enum(['first-party', 'community']),
		permissions: z.array(z.enum(PERMISSION_CATEGORIES)).optional(),
		// Accept the canonical preset ids + the legacy 'vertex' brand alias
		// (still valid input; resolvePresetMembers normalises it).
		defaultPreset: z
			.enum([
				...PRESET_KIND,
				'vertex', // legacy brand alias → resolves to 'dogfood'
			])
			.optional(),
	})
	.strict();

const PLUGIN_REGISTRY_SOURCE_SCHEMA = z
	.object({
		origin: z.literal('community'),
		entries: z.array(PLUGIN_REGISTRY_ENTRY_SCHEMA),
	})
	.strict();

/** Structural schema for the config file (used by `--check`). */
export const CONFIG_FILE_SCHEMA = z
	.object({
		$schema: z.string().optional(),
		cacheDir: z.string().optional(),
		docsDir: z.string().optional(),
		surfaceMode: z.enum(MCP_TOOL_SURFACE_MODE).optional(),
		startupReport: z
			.object({
				level: z.enum(STARTUP_REPORT_LEVEL_INPUTS).optional(),
				color: z.enum(['auto', 'always', 'never']).optional(),
			})
			.strict()
			.optional(),
		managedSurface: z
			.object({
				loading: z.enum(['lazy', 'eager']).optional(),
				idleTtlMs: z.number().int().nonnegative().nullable().optional(),
				maxWarmPlugins: z
					.number()
					.int()
					.nonnegative()
					.nullable()
					.optional(),
			})
			.strict()
			.optional(),
		evidence: z
			.object({
				retentionDays: z.number().int().min(1).optional(),
				cleanup: z.enum(['on-boot', 'dry-run', 'off']).optional(),
			})
			.strict()
			.optional(),
		keepLegacy: z.boolean().optional(),
		agentWorktree: z.boolean().optional(),
		core: z
			.object({
				agentPolicy: z
					.object({
						autonomous: z.boolean().optional(),
						principles: z.array(z.string().min(1)).optional(),
					})
					.strict()
					.optional(),
			})
			.strict()
			.optional(),
		// S5 (L3 — feature flags): optional top-level feature
		// flags block. Default-off; see `docs/delendai/api/feature-flags.md`.
		// Per-plugin flags live under `plugins.<name>.options.featureFlags`.
		featureFlags: z.record(z.string(), z.boolean()).optional(),
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
				pluginPathsRoot: z.string(),
				sourceRoot: z.string(),
			})
			.strict()
			.optional(),
		// U5 — native authorized-roots filesystem allowlist.
		// Extra absolute roots the operator authorizes for `fs_read` /
		// `fs_write` beyond the workspace root. Default `[]` (off): with
		// no entries the native fs tools keep their single-root,
		// reject-absolute behaviour. Authorization is explicit, durable
		// and reviewable because it lives in the committed config file.
		filesystem: z
			.object({
				authorizedRoots: z.array(z.string()).optional(),
			})
			.strict()
			.optional(),
		commitAuthor: z
			.object({
				// The mode list is sourced from `commit-author.ts` so
				// the schema, the type and the resolver never drift.
				mode: z.enum(COMMIT_AUTHOR_MODES).optional(),
				clientName: z.string().optional(),
				modelName: z.string().optional(),
				humanName: z.string().optional(),
				humanEmail: z.string().optional(),
			})
			.strict()
			.optional(),
		validationMatrix: z
			.object({
				scopes: z.record(
					z.string(),
					z.array(
						z.object({
							command: z.string(),
							expect: z.string(),
						}),
					),
				),
			})
			.optional(),
		plugins: z
			.record(
				z.string(),
				z.object({
					enabled: z.boolean().optional(),
					origin: z
						.enum(['bundled', 'user-local', 'external'])
						.optional(),
					prefix: z.string().optional(),
					options: z.record(z.string(), z.unknown()).optional(),
					// S1: explicit module path for a local plugin.
					// Relative paths resolve against the workspace root;
					// absolute paths and `file:`/`./`/`/`-prefixed values
					// are forwarded verbatim to `loadPlugins`.
					path: z.string().optional(),
				}),
			)
			.optional(),
		pluginRegistry: z
			.object({
				communitySources: z
					.array(PLUGIN_REGISTRY_SOURCE_SCHEMA)
					.optional(),
			})
			.strict()
			.optional(),
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
			.optional(),
		// S3 — cache eviction policy. Additive + backward
		// compatible: a config without this block defaults to
		// `runOnBoot: 'dry-run'` (the boot sweep only logs a report).
		cache: z
			.object({
				runOnBoot: z.enum(['dry-run', 'apply', 'off']).optional(),
				maxAgeDays: z.number().optional(),
				worktrees: z
					.object({
						enabled: z.boolean().optional(),
						keepLastN: z.number().optional(),
					})
					.strict()
					.optional(),
			})
			.strict()
			.optional(),
		loopDetector: z
			.object({
				enabled: z.boolean().optional(),
				repeatThreshold: z.number().optional(),
				nearRepeatThreshold: z.number().optional(),
				similarityThreshold: z.number().optional(),
				idleThreshold: z.number().optional(),
				noProgressThreshold: z.number().optional(),
				ringSize: z.number().optional(),
				gitCheckTools: z.array(z.string()).optional(),
				handoffDir: z.string().optional(),
				handoffTtlDays: z.number().optional(),
				notifyOnDetect: z.boolean().optional(),
				interactiveAgentPatterns: z.array(z.string()).optional(),
			})
			.strict()
			.optional(),
		bootstrap: z
			.object({
				patternOverrides: z
					.record(
						z.string(),
						z.object({
							type: z.string(),
							describe: z.string(),
							recommendedTools: z.array(
								z.object({
									name: z.string(),
									description: z.string(),
								}),
							),
							recommendedPlugins: z.array(z.string()),
							knowledgeHints: z.array(z.string()),
						}),
					)
					.optional(),
			})
			.strict()
			.optional(),
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
	.strict();
