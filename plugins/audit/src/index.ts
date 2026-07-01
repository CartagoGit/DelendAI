import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import {
	SCORE_DIMENSIONS,
	SCOPE_LABEL,
	UNIVERSAL_SCOPES,
} from './lib/services/audit-brief.service';
import type { ILayerConfig } from './lib/services/audit-brief.service';
import { buildConsolidateRegistration } from './lib/tools/audit-consolidate.tool';
import { buildPlanRegistration } from './lib/tools/audit-plan.tool';
import { buildRunRegistration } from './lib/tools/audit-run.tool';

/**
 * `@mcp-vertex/audit` — multi-model audit plugin (l99, alcance A + B).
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
 * Activation is opt-in: `mcp-vertex --plugins=audit`. The `audit_plan`
 * and `audit_consolidate` tools make no network calls (no API fan-out,
 * no keys, no telemetry). `audit_run` DOES contact the configured LLM
 * providers — callers MUST supply API keys in the request. The plugin
 * never reads `process.env`; the host owns credential wiring.
 *
 * See `docs/mcp-vertex/proposals/f00077-automated-audit-run-tool.md` for
 * the Alcance B design and `l99-feat-multi-model-audit-plugin.md` for
 * Alcance A.
 */

const KNOWLEDGE_BRIEF = `# Plugin @mcp-vertex/audit (l99 alcance A + B)

Genera briefs de auditoría adaptados a la estructura del repo, consolida
N auditorías en una sola hoja de ruta, y (alcance B / f00077) automatiza
el ciclo: dispatches paralelos a múltiples LLMs, persistencia de
reportes, consolidación, y scaffold de propuestas de fix.

## Modos de auditoría (específico / general / monorepo)

El plugin soporta tres modos que el host puede pedir explícitamente o
que el tool infiere a partir del \`scope\` y de \`projects\`:

| Modo | Cuándo usarlo | \`scope\` | \`projects\` |
|---|---|---|---|
| \`general\` | Auditoría completa del proyecto (default para \`scope: 'full'\`) | \`full\` _(default)_ | _(omitido)_ |
| \`specific\` | Auditar un alcance puntual: una dimensión (security, tokens, tests, docs) o una capa concreta (p. ej. \`core\`) | el scope elegido | _(omitido)_ |
| \`monorepo\` | Auditar solo ciertos paquetes/proyectos del monorepo (filtrado por nombre de capa) | \`full\` _(o el que aplique)_ | array con los nombres de capa a incluir |

Ejemplos (sobre la herramienta \`audit_plan\`):

\`\`\`jsonc
// General: todo el repo
{ "scope": "full" }

// Specific: solo la dimensión de seguridad
{ "scope": "security", "mode": "specific" }

// Specific de una capa concreta
{ "scope": "core", "mode": "specific" }

// Monorepo: auditar solo los paquetes \`core\` y \`plugins\`
{ "scope": "full", "mode": "monorepo", "projects": ["core", "plugins"] }
\`\`\`

El modo se infiere automáticamente cuando no se pasa: \`projects\` no
vacío ⇒ \`monorepo\`, \`scope === 'full'\` ⇒ \`general\`, en otro caso
\`specific\`. El modo explícito gana sobre la inferencia.

## Qué hace

1. \`<prefix>_audit_plan { scope?, mode?, projects? }\` devuelve el
   brief que el agente pega en cualquier modelo. Hay dos tipos de scopes:
   - **Universales** (siempre disponibles): \`full\`, \`security\`, \`tokens\`,
     \`tests\`, \`docs\`. Agnósticos, válidos para cualquier repo.
   - **Capas** (configuradas por el host): cualquier nombre definido en
     \`options.layers\` del config. Ej. \`core\`, \`api\`, \`frontend\`, \`database\`.
     Cada capa genera un brief con los paths específicos y checks propios.
   La respuesta incluye \`availableScopes\` (filtrado en monorepo mode
   a los proyectos seleccionados) y \`projects\` (lo que pidió el caller).
2. \`<prefix>_audit_consolidate { auditDir?, topActions? }\` lee cada
   \`*.md\` de la carpeta de auditorías, parsea + deduplica + promedia
   las puntuaciones, y devuelve la vista estructurada más el maestro
   en markdown.
3. \`<prefix>_audit_run { scope, mode?, projects?, targets, … }\`
   (alcance B) cierra el bucle: envía el brief a 1–4 LLMs en paralelo
   (OpenRouter / Anthropic / Google / OpenAI), guarda los reportes como
   \`DD-MM-YYYY- <provider>(<model>).md\`, los consolida, y scaffoldea
   un archivo de propuesta por hallazgo actionable (FATAL / MUY_MAL /
   MEJORABLE) en \`docs/mcp-vertex/proposals/ready/\`. Las claves se
   reciben en la llamada — el plugin NO consulta variables de entorno.

## Escala de severidad (7 bandas, inglés puro)

El plugin usa internamente una escala de **7 bandas** (todos los tokens
del enum \`worstSeverity\` están en **inglés**; el display humano en los
reports sigue siendo español para mantener compat con el histórico):

| Token \`worstSeverity\` | Emoji | Display humano | Significado |
|---|---|---|---|
| \`FATAL\` | 🔴 | FATAL | Crítico. Bug silencioso o agujero de seguridad. Hay que corregir. |
| \`BAD\` | 🟠 | REGULAR | Problema serio que degrada calidad. |
| \`MINOR\` | 🟡 | BIEN (lado débil) | Detalle a mejorar. |
| \`OK\` | 🟢 | BIEN | Por encima de lo esperado. |
| \`GOOD\` | 🌟 | MUY_BIEN | Ejecución excelente. |
| \`PERFECT\` | 💎 | PERFECTO | Implementación perfecta, sin defectos. |
| \`EXEMPLARY\` | ✨ | ESPLÉNDIDO | Referencia, digna de copiar en otros proyectos. |

El parser de auditorías sigue aceptando las formas históricas en español
(\`MUY_MAL\`, \`MEJORABLE\`, \`MUY_BIEN\`, \`PERFECTO\`, \`ESPLÉNDIDO\`,
ASCII \`ESPLENDIDO\`) y las normaliza al token inglés canónico, así que
los reports viejos siguen siendo parseables aunque el enum canónico esté
todo en inglés.

## Modelo de scopes (project-agnostic)

El plugin es **project-agnostic** por diseño. Los scopes universales son los
mismos para cualquier repo; los scopes de capa los define el host que usa
la librería. Un repo de microservicios puede definir \`api\`, \`database\`,
\`queue\`; un monorepo puede definir \`core\`, \`plugins\`, \`extensions\`;
una librería pequeña puede no definir ninguno y usar solo los universales.
El brief generado para cada capa incluye sus paths y sus checks específicos.

El host **brandea el output** vía tres opciones opcionales:
\`projectName\` (texto del header), \`configFileName\` (placeholder del
"no hay capas" hint) y \`crossCuttingAdditions\` (invariantes propias que
se suman a las universales). Sin ninguna de las tres, el brief es 100%
agnóstico y portable a cualquier modelo en cualquier sesión.

## Alcance A (este plugin)

- Sin claves, sin red. El usuario pega el brief en cada IDE/modelo y deja
  el \`.md\` resultante en el directorio de auditorías.
- La consolidación es automática: el plugin deduplica por título + archivo
  citado, promedia las 9 dimensiones canónicas, y emite una tabla resumen.

## Alcance B (audit_run)

- **Sí contacta la red**: el usuario (o el host) pasa las API keys
  explícitamente. El plugin no consulta \`process.env\` (regla 2 de
  AGENTS.md).
- 1–8 targets por llamada; el fan-out interno capa la concurrencia
  a 4 para evitar rate-limits de cold-start.
- Timeout por defecto 90 s, configurable vía \`timeoutMs\`.
- El scaffolder asigna IDs nuevos (\`x\` por defecto) caminando el
  \`knownProposalIds\` del registry; los ids que ya existen no se
  reutilizan. El orquestador del host puede pasar \`auditId\` para
  enlazar el batch con la auditoría madre (\`related: [aNNNNN]\`).

## Auto-scaffold proposals (when the \`proposals\` plugin is loaded)

The audit plugin closes the loop end-to-end: every audit it consolidates
or runs MUST yield ready-to-run fix proposals for its FATAL / BAD /
MINOR findings — **but only when the \`proposals\` plugin is loaded in
the same MCP server**. The audit plugin auto-detects via the registry
(\`peer plugins\`) at boot.

| Scenario | Behaviour |
|---|---|
| \`proposals\` is loaded (default — \`swarm\` preset includes it) | One proposal per actionable finding (FATAL / BAD / MINOR) is scaffolded to \`docs/mcp-vertex/proposals/ready/\` with a deterministic \`xNNNNN\` id and \`related: [aNNNNN]\`. |
| \`proposals\` is NOT loaded | No proposals are written. The \`audit_run\` / \`audit_consolidate\` output returns \`proposals_skipped: "proposals plugin not loaded"\` so callers know what happened. |
| \`--plugins=audit\` only (\`proposals\` absent) | Same as above: no scaffolding. The audit still works. |
| Tool called inside a host that embeds the audit plugin without proposals | Same as above: no scaffolding. |

Defaults to **enabled when proposals is available**. Set
\`options.autoScaffoldProposals: false\` in \`plugins.audit.options\` or
pass \`autoScaffoldProposals: false\` on the tool call to opt out.

## Configuration (host-agnostic)

\`\`\`jsonc
// the host config file (e.g. mcp-vertex.config.json, app.toml, settings.yaml)
{
  "plugins": {
    "audit": {
      "options": {
        "projectName": "<your project name>",
        "configFileName": "<your config file>",
        "auditDir": "docs/mcp-vertex/proposals/done/audits",
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
 * typed values via `mcp-vertex.config.json`.
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
		 * `docs/mcp-vertex/proposals/done/audits`. Used by `audit_consolidate` as the
		 * fallback when the tool call does not pass `auditDir`.
		 */
		auditDir: z.string().min(1).optional(),
		/**
		 * Workspace-relative directory where `audit_run` writes
		 * scaffolded fix proposals. Default:
		 * `docs/mcp-vertex/proposals/ready`. The tool validates the
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
		 * (e.g. `mcp-vertex.config.json`, `app.toml`, `<config-file>`).
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
 * Default values for {@link OptionsSchema}. Kept as a single object so
 * the knowledge entry and the `register` function agree on the same
 * fallback values without risk of drift.
 */
const DEFAULT_OPTIONS = {
	auditDir: 'docs/mcp-vertex/proposals/done/audits',
	topActions: 5,
	dimensions: SCORE_DIMENSIONS,
	// Default to auto-scaffolding when proposals is available. Hosts
	// that want manual control pass `autoScaffoldProposals: false`.
	autoScaffoldProposals: true,
} as const;

export default definePlugin({
	name: 'audit',
	version: '0.1.0',
	describe:
		'Multi-model audit plugin (l99 alcance A): canonical brief generator + consolidation across N model reports. Read-only, no network, no secrets.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const optionsResult = OptionsSchema.safeParse(ctx.options);
		const pluginOptions = optionsResult.success ? optionsResult.data : {};
		const auditDir = pluginOptions.auditDir ?? DEFAULT_OPTIONS.auditDir;
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
				pluginOptions.proposalsDir ?? 'docs/mcp-vertex/proposals/ready',
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
			tools: [plan, consolidate, run],
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
