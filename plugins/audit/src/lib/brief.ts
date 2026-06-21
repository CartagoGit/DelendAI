/**
 * The canonical audit brief — the markdown block that an agent pastes
 * into a fresh model session to elicit an audit in the format this
 * repo expects.
 *
 * The brief is intentionally **language-agnostic** (it asks for
 * Spanish translations of the model-side text, but the rubric and
 * format are universal). The shape mirrors what the existing audits
 * in `docs/proposals/audits/` and `docs/proposals/done/` already use,
 * so the consolidator can parse both this plugin's outputs and the
 * pre-existing artefacts without a fork.
 *
 * Keeping the brief as a single exported string is the simplest possible
 * contract: `audit_plan { scope }` returns it verbatim; downstream
 * consumers (web, scripts, future tools) can re-emit it without
 * duplicating the prose.
 */

export type AuditScope =
	| 'full'
	| 'core'
	| 'plugins'
	| 'web'
	| 'security'
	| 'tokens'
	| 'tests'
	| 'docs';

export const SCOPE_LABEL: Readonly<Record<AuditScope, string>> = {
	full: 'Auditoría completa',
	core: 'Núcleo (`packages/core`)',
	plugins: 'Plugins (`plugins/*`)',
	web: 'Web / docs site (`apps/web`)',
	security: 'Seguridad operacional',
	tokens: 'Eficiencia de tokens / presupuesto',
	tests: 'Calidad y cobertura de tests',
	docs: 'Documentación (README, AGENTS, audit docs)',
};

/** Sections that the brief asks the model to grade, in canonical order. */
export const SCORE_DIMENSIONS: readonly string[] = [
	'Arquitectura',
	'Contratos e interfaces',
	'Eficiencia de tokens',
	'Anti-deadlock / concurrencia',
	'Calidad de código fuente',
	'Documentación',
	'Tests (estructura, cobertura, calidad)',
	'Seguridad operacional',
	'Genericidad (project-agnostic)',
];

/** Options that customise {@link buildBrief}'s output. All fields are
 *  optional; missing fields fall back to the canonical defaults
 *  ({@link SCORE_DIMENSIONS}, single-column table) so existing
 *  callers do not need to change.
 *
 *  SRP: this module owns the brief's prose + shape. The plugin's
 *  `optionsSchema` is the only place that builds an
 *  {@link IBriefOptions} from a host's config; consumers that call
 *  {@link buildBrief} directly can pass `undefined` and get the same
 *  output they had before this option was added.
 */
export interface IBriefOptions {
	/** Custom scoring dimensions to score against. Defaults to
	 *  {@link SCORE_DIMENSIONS}. The array order is preserved in the
	 *  rendered markdown table. */
	readonly dimensions?: readonly string[];
}

/**
 * Build the brief in markdown. Pure function; the only required input
 * is the chosen scope. Optional {@link IBriefOptions} override the
 * default dimensions for hosts that want a different rubric.
 * Keeping it pure means `audit_plan` can be invoked from a unit test
 * without touching the filesystem.
 */
export const buildBrief = (
	scope: AuditScope,
	options: IBriefOptions = {},
): string => {
	const scopeLabel = SCOPE_LABEL[scope];
	const dimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const dimensionsTable = dimensions.map((d) => `| ${d} | /10 |`).join('\n');

	return `# 📋 Brief de auditoría — \`@mcp-vertex/core\` (alcance: ${scopeLabel})

> **Fecha**: <YYYY-MM-DD> · **Revisor**: <Modelo + Host> · **Metodología**: Lectura
> completa del código del alcance, contratos públicos, lógica de engines,
> configuración, tests y documentación. Cita siempre \`<archivo>:<línea>\` o
> \`<archivo>#L<línea>\` cuando reportes un hallazgo.
>
> Este brief es el contrato público de \`@mcp-vertex/audit\` (l99). Si tu
> salida se aleja del formato, la herramienta \`audit_consolidate\` no
> podrá deduplicar tus hallazgos contra los de otros revisores.

---

## 🎯 Alcance

${scope === 'full' ? 'Audita el repo entero con la misma rúbrica.' : `Enfócate en ${scopeLabel}. Para el resto, basta con una nota si ves algo fuera de lugar.`}

---

## 📐 Rúbrica (5 bandas)

| Banda | Emoji | Significado |
|---|---|---|
| **FATAL** | 🔴 | Error crítico / bug silencioso / agujero de seguridad. Hay que corregir. |
| **MUY MAL** | 🟠 | Problema serio que degrada calidad. |
| **MEJORABLE** | 🟡 | Detalle a mejorar. |
| **OK** | 🟢 | Por encima de lo esperado. |
| **MUY BIEN** | 🌟 | Ejecución excelente. |
| **PERFECTO** | 💎 | Referencia. |

Para cada hallazgo usa el bloque:

\`\`\`
### N. <título imperativo>
**Fichero**: \`<archivo>:<línea>\` (opcional)

<descripción en 1–3 párrafos, con snippet inline si aporta>
\`\`\`

---

## 🧭 Secciones a inspeccionar (checklist)

1. **Núcleo \`packages/core\`** — \`IMcpPluginContext\`, \`definePlugin\`,
   \`assemble\`, \`withFileMutex\`, \`writeFileAtomic\`,
   \`quarantineCorruptFile\`, \`createMcpProject\`,
   \`resolveWorkspaceContained\`.
2. **Plugins \`plugins/*\`** — contratos respetados, no \`process.cwd()\`,
   rutas vía \`ctx.workspace\`, mutex cuando hay escritura,
   \`redactSecrets\` en cualquier persistencia. Cada plugin debe honrar
   u, si no aplica, ignorar **explícitamente** \`ctx.keepLegacy\` (no
   dejarlo sin mencionar en su código ni en su doc).
3. **Web \`apps/web\`** — i18n completa (12 langs),
   \`apps/web/src/i18n/tools/<tool>.ts\` poblado,
   \`check:i18n\` verde, páginas 1-idioma-1-página.
4. **Validación** — \`bun run validate\` (typecheck + biome + stylelint + tests).
5. **Tests** — patrones \`*.spec.ts\` colocated; usan \`vi.fn()\`; el
   orquestador no se cuelga en bucles.
6. **Observabilidad** — \`mcp-vertex_metrics\` es la primitiva canónica
   de observabilidad; toda auditoría debe verificar que está presente,
   que persiste su estado entre llamadas, y que un snapshot-diff entre
   dos invocaciones refleja la actividad real del host.
7. **Tipos generados** — cualquier plugin cuyas tools declaren un
   \`outputSchema\` tipado debe tener su \`src/generated/tool-outputs.ts\`
   generado (\`bun run types:generate\`) y commiteado — no basta con que
   el schema exista en el código si el tipo generado está ausente o
   desfasado.

---

## 📊 Tabla de puntuación final (obligatoria)

Termina SIEMPRE con esta tabla (9 filas, una por dimensión). Score 0–10 o
\`?\` si no puedes evaluar.

${dimensionsTable}

Y un cierre: \`**Nota final: X/10 — <justificación de una línea>**\`.

---

## 📝 Recomendaciones prioritarias (al final)

Una tabla compacta \`| 🔴 P0 | <acción> | <archivo> |\` con las
3–5 acciones más urgentes. Solo acciones concretas (no "mejorar la
documentación").

---

## 🪶 Estilo

- Cita \`<archivo>:<línea>\` siempre que puedas.
- Snippets inline cuando aporten (≤ 12 líneas).
- No infles: si una dimensión está bien, dilo en una línea y pasa.
- Devuelve **un solo markdown** que empiece por el frontmatter y
  termine por la tabla de recomendaciones.
`;
};

/** All scopes, ordered for the brief (default first). */
export const ALL_SCOPES: readonly AuditScope[] = [
	'full',
	'core',
	'plugins',
	'web',
	'security',
	'tokens',
	'tests',
	'docs',
];
