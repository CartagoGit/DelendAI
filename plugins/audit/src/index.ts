import { definePlugin, joinRel } from '@delendai/core/public';
import z from 'zod';

import {
	SCORE_DIMENSIONS,
	SCOPE_LABEL,
	UNIVERSAL_SCOPES,
} from './lib/services/audit-brief.service';
import type { ILayerConfig } from './lib/services/audit-brief.service';
import { buildConsolidateRegistration } from './lib/tools/audit-consolidate.tool';
import { buildPlanRegistration } from './lib/tools/audit-plan.tool';
import { buildRunRegistration } from './lib/tools/audit-run.tool';
import { buildSelfAuditRegistration } from './lib/tools/self-audit.tool';

/**
 * `@delendai/audit` — multi-model audit plugin (l99, alcance A + B).
 *
 * The plugin ships with three tools:
 *
 * - `<prefix>_audit_plan { scope? }` — returns the canonical brief an
 *   agent pastes into a fresh model session. No I/O, no secrets.
 * - `<prefix>_audit_consolidate { auditDir?, topActions? }` — reads
 *   every `*.md` in the audits directory, parses + deduplicates + averages
 *   scores, returns the structured view + the master markdown.
 * - `<prefix>_audit_run { scope, targets, … }` — Alcance B (f00077):
 *   dispatches the brief to one or more LLM targets in parallel, saves
 *   the markdown reports, consolidates the findings, and scaffolds
 *   ready-to-run proposal files for every actionable severity band.
 *
 * Plus one knowledge entry that documents the brief contract for agents
 * that want to read it on demand instead of calling the tool.
 *
 * Activation is opt-in: `delendai --plugins=audit`. The `audit_plan`
 * and `audit_consolidate` tools make no network calls (no API fan-out,
 * no keys, no telemetry). `audit_run` DOES contact the configured LLM
 * providers — callers MUST supply API keys in the request. The plugin
 * never reads `process.env`; the host owns credential wiring.
 *
 * See `docs/delendai/proposals/f00077-automated-audit-run-tool.md` for
 * the Alcance B design and `l99-feat-multi-model-audit-plugin.md` for
 * Alcance A.
 */

const KNOWLEDGE_BRIEF = `# Plugin @delendai/audit (l99 alcance A + B)

Generates audit briefs adapted to the repo structure, consolidates N
audits into a single roadmap, and (scope B / f00077) automates the
cycle: parallel dispatches to multiple LLMs, report persistence,
consolidation, and fix-proposal scaffolding.

## Audit modes (specific / general / monorepo)

The plugin supports three modes the host can request explicitly or that
the tool infers from \`scope\` and \`projects\`:

| Mode | When to use it | \`scope\` | \`projects\` |
|---|---|---|---|
| \`general\` | Full project audit (default for \`scope: 'full'\`) | \`full\` _(default)_ | _(omitted)_ |
| \`specific\` | Audit a focused scope: a dimension (security, tokens, tests, docs) or a concrete layer (e.g. \`core\`) | the chosen scope | _(omitted)_ |
| \`monorepo\` | Audit only certain packages/projects in the monorepo (filtered by layer name) | \`full\` _(or applicable)_ | array with the layer names to include |

Examples (on the \`audit_plan\` tool):

\`\`\`jsonc
// General: the whole repo
{ "scope": "full" }

// Specific: only the security dimension
{ "scope": "security", "mode": "specific" }

// Specific on a concrete layer
{ "scope": "core", "mode": "specific" }

// Monorepo: audit only the \`core\` and \`plugins\` packages
{ "scope": "full", "mode": "monorepo", "projects": ["core", "plugins"] }
\`\`\`

The mode is inferred automatically when not passed: \`projects\` non-empty
⇒ \`monorepo\`, \`scope === 'full'\` ⇒ \`general\`, otherwise \`specific\`.
The explicit mode wins over inference.

## What it does

1. \`<prefix>_audit_plan { scope?, mode?, projects? }\` returns the brief
   that the agent pastes into any model. There are two kinds of scopes:
   - **Universal** (always available): \`full\`, \`security\`, \`tokens\`,
     \`tests\`, \`docs\`. Agnostic, valid for any repo.
   - **Layers** (configured by the host): any name defined in
     \`options.layers\` of the config. E.g. \`core\`, \`api\`, \`frontend\`, \`database\`.
     Each layer generates a brief with its specific paths and checks.
   The response includes \`availableScopes\` (filtered in monorepo mode
   to the selected projects) and \`projects\` (what the caller asked for).
2. \`<prefix>_audit_consolidate { auditDir?, topActions? }\` reads each
   \`*.md\` from the audits folder, parses + deduplicates + averages the
   scores, and returns the structured view plus the master markdown.
3. \`<prefix>_audit_run { scope, mode?, projects?, targets, … }\`
   (scope B) closes the loop: sends the brief to 1–4 LLMs in parallel
   (OpenRouter / Anthropic / Google / OpenAI), saves the reports as
   \`DD-MM-YYYY- <provider>(<model>).md\`, consolidates them, and
   scaffolds one proposal file per actionable finding (FATAL / MUY_MAL /
   MEJORABLE) under \`docs/delendai/proposals/ready/\`. Keys are passed
   in the call — the plugin does NOT read environment variables.

## Severity scale (7 bands, pure English)

The plugin uses internally a scale of **7 bands** (every token in the
\`worstSeverity\` enum is in **English**; the human display in the reports
remains Spanish for historical compatibility):

| Token \`worstSeverity\` | Emoji | Human display | Meaning |
|---|---|---|---|
| \`FATAL\` | 🔴 | FATAL | Critical. Silent bug or security hole. Must be corrected. |
| \`BAD\` | 🟠 | REGULAR | Serious problem that degrades quality. |
| \`MINOR\` | 🟡 | BIEN (weak side) | Detail to improve. |
| \`OK\` | 🟢 | BIEN | Above expectations. |
| \`GOOD\` | 🌟 | MUY_BIEN | Excellent execution. |
| \`PERFECT\` | 💎 | PERFECTO | Perfect implementation, without defects. |
| \`EXEMPLARY\` | ✨ | EXEMPLARY | Reference, worth copying in other projects. |

The audit parser keeps accepting the historical Spanish forms
(\`MUY_MAL\`, \`MEJORABLE\`, \`MUY_BIEN\`, \`PERFECTO\`, \`ESPLÉNDIDO\`,
ASCII \`ESPLENDIDO\`) and normalizes them to the canonical English token,
so the old reports remain parseable even though the canonical enum is
all in English.

## Scopes model (project-agnostic)

The plugin is **project-agnostic** by design. The universal scopes are the
same for any repo; the layer scopes are defined by the host using the
library. A microservices repo can define \`api\`, \`database\`, \`queue\`;
a monorepo can define \`core\`, \`plugins\`, \`extensions\`; a small
library may define none and use only the universal ones. The brief
generated for each layer includes its paths and its specific checks.

The host **brands the output** via three optional options:
\`projectName\` (header text), \`configFileName\` (placeholder for the
"no layers" hint) and \`crossCuttingAdditions\` (own invariants added to
the universal ones). Without any of the three, the brief is 100%
agnostic and portable to any model in any session.

## Scope A (this plugin)

- No keys, no network. The user pastes the brief into each IDE/model and
  leaves the resulting \`.md\` in the audits directory.
- Consolidation is automatic: the plugin deduplicates by title + cited
  file, averages the 9 canonical dimensions, and emits a summary table.

## Scope B (audit_run)

- **Yes, it contacts the network**: the user (or the host) passes the
  API keys explicitly. The plugin does not read \`process.env\` (rule 2
  of AGENTS.md).
- 1–8 targets per call; the internal fan-out caps concurrency at 4 to
  avoid cold-start rate-limits.
- Default timeout 90 s, configurable via \`timeoutMs\`.
- The scaffolder assigns new IDs (\`x\` by default) walking the
  \`knownProposalIds\` from the registry; existing IDs are not reused.
  The host orchestrator can pass \`auditId\` to link the batch with the
  parent audit (\`related: [aNNNNN]\`).

## Auto-scaffold proposals (when the \`proposals\` plugin is loaded)

The audit plugin closes the loop end-to-end: every audit it consolidates
or runs MUST yield ready-to-run fix proposals for its FATAL / BAD /
MINOR findings — **but only when the \`proposals\` plugin is loaded in
the same MCP server**. The audit plugin auto-detects via the registry
(\`peer plugins\`) at boot.

| Scenario | Behaviour |
|---|---|
| \`proposals\` is loaded (default — \`swarm\` preset includes it) | A native parent plan plus one linked child proposal per actionable finding (FATAL / BAD / MINOR) is scaffolded to \`docs/delendai/proposals/ready/\`. |
| \`proposals\` is NOT loaded | No proposals are written. The \`audit_run\` / \`audit_consolidate\` output returns \`proposals_skipped: "proposals plugin not loaded"\` so callers know what happened. |
| \`--plugins=audit\` only (\`proposals\` absent) | Same as above: no scaffolding. The audit still works. |
| Tool called inside a host that embeds the audit plugin without proposals | Same as above: no scaffolding. |

Defaults to **enabled when proposals is available**. Set
\`options.autoScaffoldProposals: false\` in \`plugins.audit.options\` or
pass \`autoScaffoldProposals: false\` on the tool call to opt out.

## Configuration (host-agnostic)

\`\`\`jsonc
// the host config file (e.g. delendai.config.json, app.toml, settings.yaml)
{
  "plugins": {
    "audit": {
      "options": {
        "projectName": "<your project name>",
        "configFileName": "<your config file>",
        "auditDir": "docs/delendai/proposals/done/audits",
        "topActions": 5,
        "autoScaffoldProposals": true,
        "dimensions": ["Architecture", "Tests", "Documentation", "Genericity"],
        "crossCuttingAdditions": [
          "- **Your invariant 1**: short description.",
          "- **Your invariant 2**: short description."
        ],
        "layers": [
          {
            "name": "core",
            "label": "Core packages",
            "paths": ["packages/core/src/", "packages/client/src/"],
            "checks": ["Mutable globals in hot paths?", "Writes without mutex?"]
          },
          {
            "name": "api",
            "label": "API Layer",
            "paths": ["src/api/", "src/routes/"],
            "checks": ["Rate limiting applied?", "Inputs validated against schema?"]
          }
        ]
      }
    }
  }
}
\`\`\`

All fields are optional. Without \`layers\`, \`full\` scope produces a
generic source-reading guide. With \`layers\`, each layer appears as a
scope and the \`full\` brief includes all layers with their paths and
checks. \`projectName\` and \`configFileName\` only change the header
branding and the "no layers configured" hint; the universal rubrics do
not mention them. \`crossCuttingAdditions\` is layered on top of the
universal invariants (observability, flag honoring, typed outputs) so
the model also checks host-specific rules.
`;

/**
 * Plugin-level options. Every field is optional; missing fields fall
 * back to the canonical defaults so existing hosts (no options block)
 * behave exactly as before. This is the OCP seam: the plugin's
 * defaults stay stable, hosts that need to override them pass
 * typed values via `delendai.config.json`.
 */
const LayerSchema = z.object({
	/** Unique scope identifier (e.g. `core`, `api`, `frontend`). */
	name: z.string().min(1),
	/** Human-readable label shown in the brief header. */
	label: z.string().min(1),
	/**
	 * Workspace-relative directories or files the LLM must read.
	 * (e.g. `['packages/core/src/', 'packages/client/src/']`)
	 */
	paths: z.array(z.string().min(1)).min(1),
	/**
	 * Optional additional checks specific to this layer, rendered as
	 * bullet points in the generated reading-phase section.
	 */
	checks: z.array(z.string().min(1)).optional(),
});

const OptionsSchema = z
	.object({
		/**
		 * Workspace-relative directory where individual audits land
		 * (the `*.md` outputs of `audit_plan` per model). Default:
		 * `<docsDir>/proposals/done/audits` (host's resolved `docsDir`). Used by `audit_consolidate` as the
		 * fallback when the tool call does not pass `auditDir`.
		 */
		auditDir: z.string().min(1).optional(),
		/**
		 * Workspace-relative directory where `audit_run` writes
		 * scaffolded fix proposals. Default:
		 * `<docsDir>/proposals/ready` (host's resolved `docsDir`). The tool validates the
		 * path against the workspace root before any write happens.
		 */
		proposalsDir: z.string().min(1).optional(),
		/**
		 * How many top actions to surface in `audit_consolidate`'s
		 * output. 1–50, default 5 (the engine's own default). Per-call
		 * `topActions` on the tool override this value.
		 */
		topActions: z.number().int().min(1).max(50).optional(),
		/**
		 * Custom scoring dimensions. Replaces the canonical
		 * `SCORE_DIMENSIONS` list everywhere a dimension is surfaced
		 * (the brief table, the `audit_plan` output's `dimensions`
		 * array). An empty array falls back to the canonical list —
		 * useful for hosts that pass `[]` to mean "use the default".
		 */
		dimensions: z.array(z.string().min(1)).optional(),
		/**
		 * Host-defined codebase layers to audit. Each layer becomes an
		 * available scope for `audit_plan` and gets its own reading-phase
		 * section in the generated brief.
		 *
		 * Example for a monorepo:
		 * ```json
		 * "layers": [
		 *   { "name": "core", "label": "Core packages", "paths": ["packages/core/src/"] },
		 *   { "name": "api",  "label": "API layer",     "paths": ["src/api/", "src/routes/"] }
		 * ]
		 * ```
		 */
		layers: z.array(LayerSchema).optional(),
		/**
		 * Project name rendered in the brief header and in the
		 * consolidated master document. Keeps the brief agnostic for
		 * hosts that never set it (the default placeholder is
		 * `"the project"`).
		 */
		projectName: z.string().min(1).optional(),
		/**
		 * Config file path rendered in the "no layers configured" hint
		 * (e.g. `delendai.config.json`, `app.toml`, `<config-file>`).
		 * Hosts that want to point the model at a concrete file can
		 * pass it here; the default placeholder avoids leaking any
		 * specific host vocabulary.
		 */
		configFileName: z.string().min(1).optional(),
		/**
		 * Host-specific cross-cutting invariants rendered into the
		 * brief's "Cross-cutting invariants" block (after the universal
		 * defaults). Use this to inject project-specific "must check
		 * this" rules without forking `buildBrief`.
		 */
		crossCuttingAdditions: z.array(z.string().min(1)).optional(),
		/**
		 * Whether the audit toolchain should automatically scaffold
		 * fix proposals for the actionable findings of every audit
		 * (FATAL / BAD / MINOR). The behaviour is gated on the
		 * `proposals` peer plugin being loaded in the same MCP
		 * server — when proposals is absent, the audit plugin
		 * surfaces a `proposals_skipped` reason in the response and
		 * skips the write. Default `true` so hosts that ship the
		 * default `swarm` preset (which already includes proposals)
		 * close the audit loop without extra config. Hosts that
		 * prefer manual scaffolding pass `false`.
		 */
		autoScaffoldProposals: z.boolean().optional(),
	})
	.strict();

/**
 * Default values for {@link OptionsSchema} that do not depend on the
 * host's resolved `docsDir` (S-B/x00165: `auditDir`/`proposalsDir` used
 * to be static literals here too, hardcoding `docs/delendai/...`
 * regardless of the host's actual configured docs root — now derived
 * from `ctx.docsDir` inside `register()` instead, matching the same
 * `IMcpPluginContext`-driven pattern `plugins/proposals` already uses).
 */
const DEFAULT_OPTIONS = {
	topActions: 5,
	dimensions: SCORE_DIMENSIONS,
	// Default to auto-scaffolding when proposals is available. Hosts
	// that want manual control pass `autoScaffoldProposals: false`.
	autoScaffoldProposals: true,
} as const;

export default definePlugin({
	name: 'audit',
	version: '0.1.1',
	describe:
		'Multi-model audit planning and consolidation, plus explicit provider-backed audit_run with network/write effects and optional proposal scaffolding.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const optionsResult = OptionsSchema.safeParse(ctx.options);
		const pluginOptions = optionsResult.success ? optionsResult.data : {};
		const auditDir =
			pluginOptions.auditDir ??
			joinRel(ctx.docsDir, 'proposals/done/audits');
		const topActions =
			pluginOptions.topActions ?? DEFAULT_OPTIONS.topActions;
		// Empty-array → canonical dimensions (explicit reset). Non-empty
		// → caller-supplied dimensions. Undefined → canonical dimensions
		// (default). Both branches share the same fallback.
		const dimensions =
			pluginOptions.dimensions && pluginOptions.dimensions.length > 0
				? pluginOptions.dimensions
				: DEFAULT_OPTIONS.dimensions;
		const layers: readonly ILayerConfig[] =
			(pluginOptions.layers as readonly ILayerConfig[] | undefined) ?? [];
		const projectName = pluginOptions.projectName;
		const configFileName = pluginOptions.configFileName;
		const crossCuttingAdditions = pluginOptions.crossCuttingAdditions;
		const autoScaffoldProposals =
			pluginOptions.autoScaffoldProposals ??
			DEFAULT_OPTIONS.autoScaffoldProposals;
		// Peer-plugins registry is forwarded to every tool so the
		// handlers can gate work (auto-scaffold proposals / read-only
		// mode) on whether a particular plugin is loaded in the same
		// MCP server. Empty registry at register time (the load
		// happens after) — handlers read it lazily on each call.
		const peerPlugins = ctx.peerPlugins;
		const plan = buildPlanRegistration({
			namespacePrefix: ctx.namespacePrefix,
			dimensions,
			layers,
			...(projectName !== undefined ? { projectName } : {}),
			...(configFileName !== undefined ? { configFileName } : {}),
			...(crossCuttingAdditions !== undefined
				? { crossCuttingAdditions }
				: {}),
		});
		const consolidate = buildConsolidateRegistration({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			defaultAuditDir: auditDir,
			defaultTopActions: topActions,
			...(projectName !== undefined ? { projectName } : {}),
			...(configFileName !== undefined ? { configFileName } : {}),
			...(crossCuttingAdditions !== undefined
				? { crossCuttingAdditions }
				: {}),
			autoScaffoldProposals,
			...(peerPlugins !== undefined ? { peerPlugins } : {}),
		});
		const run = buildRunRegistration({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			defaultAuditDir: auditDir,
			defaultProposalsDir:
				pluginOptions.proposalsDir ??
				joinRel(ctx.docsDir, 'proposals/ready'),
			dimensions,
			layers,
			...(projectName !== undefined ? { projectName } : {}),
			...(configFileName !== undefined ? { configFileName } : {}),
			...(crossCuttingAdditions !== undefined
				? { crossCuttingAdditions }
				: {}),
			autoScaffoldProposals,
			...(peerPlugins !== undefined ? { peerPlugins } : {}),
		});
		return {
			tools: [
				plan,
				consolidate,
				run,
				buildSelfAuditRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'audit-overview',
					title: 'Audit plugin — overview',
					body: KNOWLEDGE_BRIEF,
				},
				{
					id: 'audit-scopes',
					title: 'Audit scopes',
					body:
						'Universal scopes (always available):\n' +
						UNIVERSAL_SCOPES.map(
							(id) => `- \`${id}\` — ${SCOPE_LABEL[id]}`,
						).join('\n') +
						(configFileName !== undefined
							? `\n\nLayer scopes are configured via \`options.layers\` in \`${configFileName}\`.`
							: '\n\nLayer scopes are configured via `options.layers` in the host config file.'),
				},
			],
		};
	},
});
