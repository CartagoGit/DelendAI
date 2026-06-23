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

/**
 * `@mcp-vertex/audit` — multi-model audit plugin (l99, alcance A).
 *
 * The plugin ships with two tools:
 *
 * - `<prefix>_audit_plan { scope? }` — returns the canonical brief an
 *   agent pastes into a fresh model session. No I/O, no secrets.
 * - `<prefix>_audit_consolidate { auditDir?, topActions? }` — reads
 *   every `*.md` in the audits directory, parses + deduplicates + averages
 *   scores, returns the structured view + the master markdown.
 *
 * Plus one knowledge entry that documents the brief contract for agents
 * that want to read it on demand instead of calling the tool.
 *
 * Activation is opt-in: `mcp-vertex --plugins=audit`. The plugin makes no
 * network calls (no API fan-out, no keys, no telemetry). For the
 * network-enabled scope (l99 B), a separate opt-in plugin would own that.
 *
 * See `docs/proposals/l99-feat-multi-model-audit-plugin.md` for the
 * design rationale and the 3-enfoque analysis.
 */

const KNOWLEDGE_BRIEF = `# Plugin @mcp-vertex/audit (l99 alcance A)

Sin red, sin secretos. Genera briefs de auditoría adaptados a la estructura
del repo y consolida N auditorías en una sola hoja de ruta.

## Qué hace

1. \`<prefix>_audit_plan { scope? }\` devuelve el brief que el agente pega
   en cualquier modelo. Hay dos tipos de scopes:
   - **Universales** (siempre disponibles): \`full\`, \`security\`, \`tokens\`,
     \`tests\`, \`docs\`. Agnósticos, válidos para cualquier repo.
   - **Capas** (configuradas por el host): cualquier nombre definido en
     \`options.layers\` del config. Ej. \`core\`, \`api\`, \`frontend\`, \`database\`.
     Cada capa genera un brief con los paths específicos y checks propios.
   La respuesta incluye \`availableScopes\` con la lista completa de scopes activos.
2. \`<prefix>_audit_consolidate { auditDir?, topActions? }\` lee cada
   \`*.md\` de la carpeta de auditorías, parsea + deduplica + promedia
   las puntuaciones, y devuelve la vista estructurada más el maestro
   en markdown.

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

## Configuración (host-agnostic)

\`\`\`jsonc
// el config-file que use el host (p. ej. mcp-vertex.config.json, app.toml, settings.yaml)
{
  "plugins": {
    "audit": {
      "options": {
        "projectName": "<your project name>",
        "configFileName": "<your config file>",
        "auditDir": "docs/proposals/audits",
        "topActions": 5,
        "dimensions": ["Arquitectura", "Tests", "Documentación", "Genericidad"],
        "crossCuttingAdditions": [
          "- **Tu invariante 1**: descripción breve.",
          "- **Tu invariante 2**: descripción breve."
        ],
        "layers": [
          {
            "name": "core",
            "label": "Core packages",
            "paths": ["packages/core/src/", "packages/client/src/"],
            "checks": ["¿Globals mutables en hot paths?", "¿Escrituras sin mutex?"]
          },
          {
            "name": "api",
            "label": "API Layer",
            "paths": ["src/api/", "src/routes/"],
            "checks": ["¿Rate limiting aplicado?", "¿Inputs validados contra schema?"]
          }
        ]
      }
    }
  }
}
\`\`\`

Todos los campos son opcionales. Sin \`layers\`, el scope \`full\` genera una guía
genérica de lectura de código. Con \`layers\`, cada capa aparece como scope y el
brief de \`full\` incluye todas las capas con sus paths y checks específicos.
\`projectName\` y \`configFileName\` solo cambian el branding del header y de la
pista "no hay capas configuradas"; las rúbricas universales no los mencionan.
\`crossCuttingAdditions\` se suma a las invariantes universales (observabilidad,
honoring de flags, outputs tipados) para que el modelo chequee también lo propio
del host.
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
		 * `docs/proposals/audits`. Used by `audit_consolidate` as the
		 * fallback when the tool call does not pass `auditDir`.
		 */
		auditDir: z.string().min(1).optional(),
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
		 * brief's "Invariantes transversales" block (after the universal
		 * defaults). Use this to inject project-specific "must check
		 * this" rules without forking `buildBrief`.
		 */
		crossCuttingAdditions: z.array(z.string().min(1)).optional(),
	})
	.strict();

/**
 * Default values for {@link OptionsSchema}. Kept as a single object so
 * the knowledge entry and the `register` function agree on the same
 * fallback values without risk of drift.
 */
const DEFAULT_OPTIONS = {
	auditDir: 'docs/proposals/audits',
	topActions: 5,
	dimensions: SCORE_DIMENSIONS,
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
		});
		return {
			tools: [plan, consolidate],
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
