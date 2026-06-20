import { definePlugin } from '@mcp-vertex/core/public';

import { SCOPE_LABEL } from './lib/brief';
import { buildConsolidateRegistration } from './lib/tools/consolidate-tool';
import { buildPlanRegistration } from './lib/tools/plan-tool';

/**
 * `@mcp-vertex/audit` — multi-model audit plugin (p99, alcance A).
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
 * network-enabled scope (p99 B), a separate opt-in plugin would own that.
 *
 * See `docs/proposals/p99-feat-multi-model-audit-plugin.md` for the
 * design rationale and the 3-enfoque analysis.
 */

const KNOWLEDGE_BRIEF = `# Plugin @mcp-vertex/audit (p99 alcance A)

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
    "audit": { "options": {} }
  }
}
\`\`\`

Sin opciones hoy (el plugin es opinionated sobre los defaults). Futuras
opciones: \`auditDir\`, \`dimensions\`, \`topActions\`.
`;

export default definePlugin({
	name: 'audit',
	version: '0.1.0',
	describe:
		'Multi-model audit plugin (p99 alcance A): canonical brief generator + consolidation across N model reports. Read-only, no network, no secrets.',
	register(ctx) {
		const plan = buildPlanRegistration({
			namespacePrefix: ctx.namespacePrefix,
		});
		const consolidate = buildConsolidateRegistration({
			namespacePrefix: ctx.namespacePrefix,
			reader: ctx.workspace.reader,
			defaultAuditDir: 'docs/proposals/audits',
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
