import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { SCOPE_LABEL, SCORE_DIMENSIONS } from './lib/brief';
import { buildConsolidateRegistration } from './lib/tools/consolidate-tool';
import { buildPlanRegistration } from './lib/tools/plan-tool';

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

Sin red, sin secretos. Estandariza el formato de auditoría del repo y
consolida N auditorías en una sola hoja de ruta.

## Qué hace

1. \`<prefix>_audit_plan { scope? }\` devuelve el brief canónico que el
   agente pega en cualquier modelo (Antigravity, Claude Code, Copilot,
   Codex, …). El scope controla el enfoque: \`full\`, \`core\`,
   \`plugins\`, \`web\`, \`security\`, \`tokens\`, \`tests\`, \`docs\`.
2. \`<prefix>_audit_consolidate { auditDir?, topActions? }\` lee cada
   \`*.md\` de la carpeta de auditorías, parsea + deduplica + promedia
   las puntuaciones, y devuelve la vista estructurada más el maestro
   en markdown.

## Alcance A (este plugin)

- Sin claves, sin red. El usuario **dispara cada modelo a mano**
  pegando el brief en cada IDE/modelo, y deja caer el \`.md\` resultante
  en \`docs/proposals/audits/\`.
- La consolidación es automática: el plugin deduplica por título +
  archivo citado, promedia las 9 dimensiones canónicas, y emite una
  tabla resumen.

## Lo que NO hace (alcance B, propuesta futura)

- No llama a OpenRouter ni a APIs externas.
- No descubre modelos del usuario.
- No escribe la auditoría por ti (es el modelo el que la escribe,
  siguiendo el brief).

## Por qué un plugin y no solo docs

- El brief es **canónico**: vive en \`buildBrief()\` y se exporta como
  string; cualquier consumidor (web, scripts, otros plugins) lo
  reemite sin divergencia.
- La consolidación es **automática y reproducible**: el mismo input
  produce el mismo output (sin timestamps, sin orden aleatorio).
- El orquestador puede \`audit_consolidate\` después de cada ronda
  sin intervención humana.

## Configuración

\`\`\`jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "audit": {
      "options": {
        "auditDir": "docs/proposals/audits",
        "topActions": 5,
        "dimensions": ["Arquitectura", "Tests", "Documentación", "Genericidad"]
      }
    }
  }
}
\`\`\`

Los tres campos son opcionales y caen a defaults sensatos cuando se
omiten: \`auditDir\` → \`docs/proposals/audits\`, \`topActions\` → 5,
\`dimensions\` → la rúbrica canónica de 9 dimensiones en
\`SCORE_DIMENSIONS\`. Una dimensión vacía (\`[]\`) restaura la rúbrica
canónica explícitamente.
`;

/**
 * Plugin-level options. Every field is optional; missing fields fall
 * back to the canonical defaults so existing hosts (no options block)
 * behave exactly as before. This is the OCP seam: the plugin's
 * defaults stay stable, hosts that need to override them pass
 * typed values via `mcp-vertex.config.json`.
 */
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
		const plan = buildPlanRegistration({
			namespacePrefix: ctx.namespacePrefix,
			dimensions,
		});
		const consolidate = buildConsolidateRegistration({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRoot: ctx.workspace.root,
			defaultAuditDir: auditDir,
			defaultTopActions: topActions,
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
					body: Object.entries(SCOPE_LABEL)
						.map(([id, label]) => `- \`${id}\` — ${label}`)
						.join('\n'),
				},
			],
		};
	},
});
