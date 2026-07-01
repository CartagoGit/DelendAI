/**
 * init-answers.schema.ts — `IInitAnswers` Zod schema.
 *
 * Closed surface for the `init` command's interactive answers. Every
 * value the user types is validated against this schema **before** any
 * file is written. Unknown plugin ids are rejected at the boundary by
 * a refinement that consults the frozen plugin catalog at
 * `contracts/constants/init-answers.constant.ts`.
 *
 * Conventions (see `docs/mcp-vertex/FILE-CONVENTIONS.md` and the
 * project `AGENTS.md` rule #2):
 *
 *   - No `process.cwd()` — workspace paths come from the CLI context.
 *   - Pure Zod — no IO, no `Bun.spawn`, no `withFileMutex`. This file is
 *     safe to import from any layer (CLI, MCP, test) without side
 *     effects.
 *   - Defaults reflect the operator's chosen workflow: preset `vertex`
 *     (snapshot of mcp-vertex.config.json), extras empty,
 *     host-instructions `append` (safe), skills + agent-md generated,
 *     migration offered.
 */
import { z } from 'zod';

import { PRESET_KIND } from '@mcp-vertex/core/public';

import { PLUGIN_IDS } from '../../contracts/constants/init-answers.constant';

/**
 * Refinement that rejects plugin ids not in `PRESET_CATALOG` and not
 * equal to `'audit'`. The error message lists the valid ids so a
 * typo'd input is corrected on the next prompt iteration.
 */
const initPluginId = z
	.string()
	.min(1)
	.refine(
		(id: string) => PLUGIN_IDS.has(id),
		`Unknown plugin. Valid ids: ${[...PLUGIN_IDS].sort().join(', ')}.`,
	);

/**
 * Final schema. Every key has a default so the user can skip a question
 * with Enter and still produce a valid bundle.
 */
export const InitAnswers = z.object({
	/** Resolved preset id. `vertex` is the operator's recommended default
	 * (snapshot of mcp-vertex.config.json — see `init:default`). */
	preset: z.enum(PRESET_KIND).default('vertex'),

	/** Plugins added on top of the preset (e.g. `audit`). */
	extraPlugins: z.array(initPluginId).default([]),

	/** Plugins subtracted from the resolved set (`--exclude-plugins`). */
	excludedPlugins: z.array(initPluginId).default([]),

	/**
	 * How to merge host-instructions fragments into the existing
	 * `AGENTS.md` / `CLAUDE.md` / `.github/copilot-instructions.md`.
	 * `append` is safe and idempotent; `overwrite` is destructive and
	 * requires an explicit confirmation; `skip` writes nothing.
	 */
	hostInstructions: z.enum(['append', 'overwrite', 'skip']).default('append'),

	/** Copy core skills from the bundled mcp-vertex repo to `docs/mcp-vertex/skills/`. */
	copyCoreSkills: z.boolean().default(true),

	/** Generate `.github/agents/mcp-vertex-<role>.agent.md` from the live catalog. */
	generateAgentMd: z.boolean().default(true),

	/**
	 * Offer to scaffold `f00001-migrate-legacy-<scope>.md` after the
	 * bundle is written. Honored only if `proposals` is in the resolved
	 * plugin set; ignored otherwise.
	 */
	migrateFromLegacy: z.boolean().default(true),

	/** Overwrite existing `mcp-vertex.config.json` without prompting. */
	force: z.boolean().default(false),

	/** Optional `owner/name` repo for the `issues` plugin. */
	issuesRepo: z.string().optional(),

	/** Optional hostname allow-list for the `web-fetch` plugin. */
	webFetchAllowList: z.array(z.string()).optional(),

	/** Workspace root resolved by the CLI context. */
	workspaceRoot: z.string().default(process.cwd()),

	/**
	 * f00088 S1: detection result from `analyzeProject`. Populated by
	 * `withDetection` BEFORE the prompt flow runs; never asked of the
	 * operator. Every field is documented in
	 * `init-detection.ts#IInitDetection`.
	 */
	detected: z
		.object({
			language: z.string(),
			framework: z.string().optional(),
			packageManager: z.string(),
			monorepoTool: z.string().optional(),
			hasMcpProject: z.boolean(),
			mcpEvidence: z.array(z.string()),
			pluginPathsRoot: z.string(),
			sourceRoot: z.enum(['libs', 'packages', 'plugins', 'src']),
			hostEntryPath: z.string().optional(),
			hostEntrySource: z.enum([
				'flag',
				'node_modules',
				'sibling',
				'npm_dist',
				'unresolved',
			]),
		})
		.optional(),
});