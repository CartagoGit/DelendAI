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
	| 'extensions'
	| 'web'
	| 'security'
	| 'tokens'
	| 'tests'
	| 'docs';

export const SCOPE_LABEL: Readonly<Record<AuditScope, string>> = {
	full: 'Auditoría completa',
	core: 'Núcleo (`packages/core`, `packages/client`)',
	plugins: 'Plugins (`plugins/*`)',
	extensions: 'Extensiones (`extensions/*`, `packages/ui-extension`)',
	web: 'Web / docs site (`apps/web`)',
	security: 'Seguridad operacional',
	tokens: 'Eficiencia de tokens / presupuesto',
	tests: 'Calidad y cobertura de tests',
	docs: 'Documentación (README, AGENTS, skills, scaffolds)',
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

// ---------------------------------------------------------------------------
// Scope-specific reading instructions
// ---------------------------------------------------------------------------

/**
 * Cross-cutting invariants that appear in EVERY scope. The consolidator
 * spec (`brief.spec.ts`) checks that these strings appear in all scopes,
 * so they MUST be included regardless of the scope value.
 */
const CROSS_CUTTING = `
### ⚠️ Invariantes transversales (siempre, independientemente del alcance)

Estos tres puntos se verifican en **cualquier** alcance de auditoría:

- **\`mcp-vertex_metrics\`** — es la primitiva canónica de observabilidad. Verifica que esté presente, que persista su estado entre llamadas, y que un snapshot-diff entre dos invocaciones refleje la actividad real del host.
- **\`ctx.keepLegacy\`** — cada plugin debe honrar o ignorar **explícitamente** este flag. Nunca dejarlo sin mencionar en código ni en docs.
- **\`tool-outputs.ts\`** — todo plugin con \`outputSchema\` tipado debe tener su \`src/generated/tool-outputs.ts\` generado y commiteado (\`bun run types:generate\`). Si el archivo está ausente o desfasado, es un hallazgo.
`;

const PHASE_CORE = `
### Fase — Paquetes del núcleo (\`packages/core\`, \`packages/client\`)

Abre y lee cada subdirectorio. Para cada fichero que toques, extrae el snippet exacto (≤ 15 líneas) y cita \`archivo:línea\`.

| Subdirectorio | Qué buscar |
|---|---|
| \`contracts/\` | ¿Interfaces completas? ¿\`constants/\` poblado o directorio vacío (dead structure)? |
| \`plugins/\` | \`load-plugins.ts\` — ¿resiliente? ¿\`process.cwd()\` como fallback? \`plugin-contract.ts\` — ¿inyección limpia, sin globals? |
| \`cli/\` | \`assemble.ts\` — ¿\`--check\` relee el config dos veces? ¿\`process.cwd()\`? \`parse-cli-args.ts\` — ¿presets actualizados con todos los plugins? |
| \`bootstrap/\` | \`analyze-project.ts\` — ¿función pura con \`IFileReader\` inyectado? ¿Sin I/O directo? |
| \`scaffold/\` | \`scaffold-host.ts\` — ¿nombre de modelo hardcodeado del autor original? |
| \`tools/\` | \`overview-tool.ts\` — ¿declara \`outputSchema\`? ¿Dentro del presupuesto de tokens? |
| \`project/\` | \`create-mcp-project.ts\` — ¿\`coreToolRegistrations\` vacío placeholder o real? |
| \`shared/\` | ¿Utilidades (\`joinRel\`, etc.) aquí o duplicadas en plugins? |

Para \`packages/client/src/\`: servicios, stdio client, connection health, notification bridge.
- ¿\`process.cwd()\`? ¿Servicios sin teardown? ¿Promesas sin capturar?
`;

const PHASE_PLUGINS = `
### Fase — Plugins (\`plugins/*\`)

Para **cada plugin** (proposals, memory, rules, quality, search, docs, deps, git, notification, status-marker, test-convention, audit…):

1. Lee \`src/index.ts\` — ¿implementa \`IMcpPlugin.register(ctx)\` sin globals mutables?
2. Lee cada engine (\`*-engine.ts\`, \`*-runner.ts\`, \`*-context.ts\`):
   - **Escrituras durables**: ¿todo \`writeFile\` pasa por \`withFileMutex\` + \`writeFileAtomic\`? Un \`fs.writeFile\` desnudo es hallazgo FATAL.
   - **\`process.cwd()\`**: ¿llamada directa o parámetro con default?
   - **I/O síncrono** (\`readFileSync\`, \`existsSync\`) en hot paths (handlers de tools)?
   - **\`outputSchema\`**: ¿cada registro de tool lo declara?
   - **\`@ts-ignore\` / \`@ts-nocheck\`**: cita cualquier ocurrencia.
   - **\`console.log\`** en paths de producción: cita.
   - **\`ctx.keepLegacy\`**: ¿honrado o ignorado explícitamente?
3. ¿Vocabulario del host en contratos genéricos? (tracks como \`'ui-demo'\`, rutas hardcodeadas como \`paused/demos\`)
4. Para \`proposals\` en particular, lee también:
   - \`persistent-task-queue.ts\` — deuda de schema de lock, I/O síncrono, backpressure.
   - \`agent-lock-engine.ts\` — atomicidad de escritura, fallback de ruta.
   - \`sync-proposal-registry.ts\` — default \`process.cwd()\`, atomicidad.
   - \`round-context.ts\` — digest SHA-256, tamaño (>500 líneas = candidato a refactor), rutas hardcodeadas.
   - \`proposal-parallelism.ts\` — ¿\`IProposalTrack\` como union abierta o cerrada?
   - \`proposal-scaffold-linter.ts\` — ¿constraint de ID de 5 dígitos (\`\\d{5}\`) aplicado?
`;

const PHASE_EXTENSIONS = `
### Fase — Extensiones (\`extensions/*\`, \`packages/ui-extension\`)

**\`extensions/vscode/src/\`**: activación, extension host, webview bridge, service wiring.
- ¿\`deactivate()\` limpia todos los disposables?
- ¿Mensajes del webview validados antes de actuar?
- ¿Algún \`import vscode\` fuera de \`extensions/vscode/\`?
- ¿Status bar items disposed al desactivar?
- ¿\`process.cwd()\` en código de extensión (debería usar workspace URIs)?

**\`packages/ui-extension\`**: panels, command palette, brand assets, CSS.
- ¿Strings hardcodeados que deberían ser i18n keys?
- ¿\`import\` desde un paquete del host (ej. \`vscode\`)? Viola el contrato host-agnostic.
- ¿Atributos ARIA faltantes en elementos interactivos?
- ¿CSS custom properties consistentes con el design token system?
`;

const PHASE_WEB = `
### Fase — Web / docs site (\`apps/web\`)

Lee páginas Astro, \`src/i18n/ui.ts\`, config de Pagefind, scripts de contenido generado.
- Cada string visible debe tener entradas en **todos** los idiomas de \`ui.ts\` (12 langs). Ejecuta \`bun run site:strict\` mentalmente.
- Páginas con \`data-pagefind-body\` — ¿la anotación es correcta y consistente?
- Docs de tools/plugins generados — ¿coinciden con el live tool registry o están desfasados?
- \`check:i18n\` verde. Una clave faltante en un idioma es hallazgo MUY_MAL.
`;

const PHASE_SECURITY = `
### Fase — Seguridad operacional

- **Escrituras atómicas**: traza cada path de escritura durable y verifica \`withFileMutex\` + \`writeFileAtomic\`. Cualquier \`fs.writeFile\` desnudo en un engine es FATAL.
- **\`redactSecrets\`**: ¿se aplica antes de persistir cualquier texto del usuario en memory o proposals?
- **\`resolveWorkspaceContained\`**: ¿todo input de path validado? Una ruta \`../\` que escape es FATAL.
- **I/O síncrono en hot paths**: \`*Sync\` en handlers de tools = MUY_MAL.
- **\`@ts-ignore\`**: cualquier ocurrencia en producción es hallazgo.
- **Secrets hardcodeados**: API keys, tokens, endpoints privados en fuente.
`;

const PHASE_TOKENS = `
### Fase — Eficiencia de tokens

- Confirma que \`overview { compact: true }\` se mantiene bajo el presupuesto medido (ver \`docs/TOKEN-BUDGETS.md\`).
- ¿Alguna descripción de tool con prosa redundante?
- ¿Instrucciones de sistema comprimibles sin perder semántica?
- Traza el path frío de un agente nuevo: ¿cuántas llamadas necesita antes de poder trabajar?
- ¿El \`roundContext\` digest evita re-lecturas innecesarias de docs no modificados?
`;

const PHASE_TESTS = `
### Fase — Tests (\`tests/\`, \`*.spec.ts\` colocated)

Lee los spec files de los engines más críticos:
- ¿Paths de concurrencia cubiertos? (dos agentes escribiendo simultáneamente)
- ¿Snapshots stale?
- ¿Los specs testean contratos o detalles de implementación?
- ¿Falta fuzzing / property-based testing en \`parseQueue\`?

Flag: engine con >300 LOC y <3 spec files = riesgo de undertest (hallazgo MEJORABLE).
Patrón canónico: \`*.spec.ts\` colocated; usan \`vi.fn()\`; el orquestador no se cuelga en bucles.
`;

const PHASE_DOCS = `
### Fase — Documentación (\`AGENTS.md\`, \`README.md\`, \`skills/\`, \`docs/scaffolds/\`)

- **\`AGENTS.md\` hard rules (1–10)**: para cada regla, ¿hay alguna violación en el código que la contradiga?
- **Skills**: abre cada \`skills/*/SKILL.md\`. ¿Nombres de tools correctos? ¿Paths que aún existen? ¿Hay tools nuevas no mencionadas?
- **Scaffolds**: ¿\`ARCHITECTURE-AUDITS.md\` describe correctamente la metodología actual?
- **READMEs de plugins**: ¿actualizados tras los últimos cambios?
- **\`tools/\`/\`scripts/\`**: ¿algún \`.py\`, \`.sh\`, \`.bash\`? Viola la regla 10 de \`AGENTS.md\`.
`;

/** Map of scope → reading phases to include. */
const SCOPE_PHASES: Readonly<Record<AuditScope, string>> = {
	full: [
		PHASE_CORE,
		PHASE_PLUGINS,
		PHASE_EXTENSIONS,
		PHASE_WEB,
		PHASE_SECURITY,
		PHASE_TOKENS,
		PHASE_TESTS,
		PHASE_DOCS,
	].join('\n'),
	core: PHASE_CORE,
	plugins: PHASE_PLUGINS,
	extensions: PHASE_EXTENSIONS,
	web: PHASE_WEB,
	security: PHASE_SECURITY,
	tokens: PHASE_TOKENS,
	tests: PHASE_TESTS,
	docs: PHASE_DOCS,
};

// ---------------------------------------------------------------------------
// Brief builder
// ---------------------------------------------------------------------------

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
	const readingPhases = CROSS_CUTTING + SCOPE_PHASES[scope];

	return `# 📋 Brief de auditoría — \`@mcp-vertex/core\` (alcance: ${scopeLabel})

> **Fecha**: <YYYY-MM-DD> · **Revisor**: <Modelo + Host> · **Metodología**: Lectura
> exhaustiva del código del alcance indicado. **Los comandos automatizados son el
> punto de partida, no el fin.** El modelo DEBE leer el código real, extraer snippets
> con referencias \`archivo#Lnn\`, y justificar cada hallazgo con evidencia concreta.
> Auditorías que solo resumen output de comandos son inválidas.
>
> Este brief es el contrato público de \`@mcp-vertex/audit\`. Si tu salida se aleja
> del formato, la herramienta \`audit_consolidate\` no podrá deduplicar tus hallazgos
> contra los de otros revisores.

---

## 🎯 Alcance

${scope === 'full' ? 'Audita el repo entero con la rúbrica completa. Todas las fases de lectura de código son obligatorias.' : `Enfócate en **${scopeLabel}**. Para el resto, basta con una nota si ves algo fuera de lugar.`}

---

## 📐 Rúbrica (bandas de severidad)

| Banda | Emoji | Significado |
|---|---|---|
| **FATAL** | 🔴 | Error crítico / bug silencioso / agujero de seguridad. Hay que corregir. |
| **MUY MAL** | 🟠 | Problema serio que degrada calidad. |
| **MEJORABLE** | 🟡 | Detalle a mejorar. |
| **OK** | 🟢 | Por encima de lo esperado. |
| **MUY BIEN** | 🌟 | Ejecución excelente. |
| **PERFECTO** | 💎 | Referencia de la que enorgullecerse. |

Para cada hallazgo usa el bloque:

\`\`\`
### N. <título imperativo>
**Fichero**: \`<archivo>#L<línea>\`

\`\`\`typescript
// snippet exacto (≤ 15 líneas)
\`\`\`

**Problema**: explicación precisa de qué está mal y por qué.
**Impacto**: qué se rompe, corrompe o degrada si no se arregla.
**Resolution Track**: [Resuelto en slice \`sN\`] | [Diferido a propuesta \`xNNNNN\`]
\`\`\`

**Regla de oro**: un hallazgo sin snippet de código no es un hallazgo — es especulación.
No escribas «podría» o «posiblemente» — o lo viste en el código, o no lo reportes.

---

## 🔬 Metodología de análisis (OBLIGATORIA)

### Fase 0 — Baseline cuantitativo (comandos permitidos)

Ejecuta y anota los resultados para la tabla \`## Verified State\`:
- \`bun run test 2>&1 | tail -5\` — cuenta tests y estado pass/fail.
- \`bun run build 2>&1 | tail -10\` — output de build.
- \`biome ci . 2>&1 | tail -10\` — cuenta warnings/errors.
- LOC aproximado: \`find <scope-dirs> -name '*.ts' | xargs wc -l | tail -1\`.

**Esta fase es el suelo, no el techo.** Continúa con las fases de lectura de código.

${readingPhases}

### Fase final — Escribe el documento de auditoría

Solo después de completar las fases de lectura anteriores, escribe el documento.
Estructura: resumen ejecutivo → hallazgos (con snippets) → scoreboard → recomendaciones.

---

## 📊 Tabla de puntuación final (obligatoria)

Termina SIEMPRE con esta tabla. Score 0–10 o \`?\` si no puedes evaluar.
Una dimensión con un hallazgo FATAL no puede superar 6/10.

${dimensionsTable}

Y un cierre: \`**Nota final: X/10 — <justificación de una línea>**\`.

---

## 📝 Recomendaciones prioritarias (al final)

Una tabla compacta \`| 🔴 P0 | <acción> | <archivo> |\` con las
3–5 acciones más urgentes. Solo acciones concretas (no «mejorar la documentación»).

---

## 🪶 Estilo

- Cita \`<archivo>#L<línea>\` siempre que puedas.
- Snippets inline cuando aporten (≤ 15 líneas).
- No infles: si una dimensión está bien, dilo en una línea y pasa.
- Devuelve **un solo markdown** que empiece por el header de auditoría y
  termine por la tabla de recomendaciones.
`;
};

/** All scopes, ordered for the brief (default first). */
export const ALL_SCOPES: readonly AuditScope[] = [
	'full',
	'core',
	'plugins',
	'extensions',
	'web',
	'security',
	'tokens',
	'tests',
	'docs',
];
