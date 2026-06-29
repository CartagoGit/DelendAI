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
 * The schema mirrors the composite `IMcpVertexConfigFile` shape
 * exactly — `.strict()` everywhere so a typo in the config file is
 * reported as a schema violation instead of being silently ignored.
 */
import { z } from 'zod';
import { COMMIT_AUTHOR_MODES } from '../shared/commit-author';

/** Structural schema for the config file (used by `--check`). */
export const CONFIG_FILE_SCHEMA = z
	.object({
		$schema: z.string().optional(),
		cacheDir: z.string().optional(),
		docsDir: z.string().optional(),
		keepLegacy: z.boolean().optional(),
		agentWorktree: z.boolean().optional(),
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
					prefix: z.string().optional(),
					options: z.record(z.string(), z.unknown()).optional(),
					// f00087 S1: explicit module path for a local plugin.
					// Relative paths resolve against the workspace root;
					// absolute paths and `file:`/`./`/`/`-prefixed values
					// are forwarded verbatim to `loadPlugins`.
					path: z.string().optional(),
				}),
			)
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
	})
	.strict();
