/**
 * The canonical audit brief — the markdown block that an agent pastes
 * into a fresh model session to elicit an audit in the format this
 * repo expects.
 *
 * ## Scope model
 *
 * Scopes are divided into two categories:
 *
 * - **Universal scopes** (`UNIVERSAL_SCOPES`): built-in, repo-agnostic. They
 *   address concerns that exist in any codebase (security, token efficiency,
 *   test quality, docs hygiene). Always available without host configuration.
 *
 * - **Layer scopes**: host-defined via the plugin's `options.layers` config.
 *   A layer is a logical slice of the codebase (e.g. `core`, `api`, `frontend`,
 *   `database`) with a label, a list of source paths to read, and optional
 *   extra checks. `buildBrief` generates a parameterised reading-phase section
 *   for each layer, so the LLM knows exactly what to open and what to look for.
 *   `full` includes all universal phases + all configured layers.
 *
 * This separation makes the plugin genuinely project-agnostic: the universal
 * scopes are always correct; the layer scopes adapt to whatever the host repo
 * looks like (monorepo, microservice, library, CLI tool, etc.).
 */

// ---------------------------------------------------------------------------
// Universal scopes (built-in, agnostic)
// ---------------------------------------------------------------------------

/** Scopes that are always available regardless of host configuration. */
export type UniversalAuditScope =
	| 'full'
	| 'security'
	| 'tokens'
	| 'tests'
	| 'docs';

/** All universal scope identifiers, in canonical order. */
export const UNIVERSAL_SCOPES: readonly UniversalAuditScope[] = [
	'full',
	'security',
	'tokens',
	'tests',
	'docs',
];

/** Human-readable labels for universal scopes. */
export const SCOPE_LABEL: Readonly<Record<UniversalAuditScope, string>> = {
	full: 'Auditoría completa',
	security: 'Seguridad operacional',
	tokens: 'Eficiencia de tokens / presupuesto',
	tests: 'Calidad y cobertura de tests',
	docs: 'Documentación (README, AGENTS, skills)',
};

/**
 * For backwards compatibility: `ALL_SCOPES` is kept as the list of
 * universal scopes. Hosts that previously iterated `ALL_SCOPES` to
 * enumerate all scopes must also include their configured layers.
 */
export const ALL_SCOPES = UNIVERSAL_SCOPES;

// ---------------------------------------------------------------------------
// Layer config (host-defined)
// ---------------------------------------------------------------------------

/**
 * A host-defined layer scope that the agent will read exhaustively.
 * Configured via `mcp-vertex.config.json → plugins.audit.options.layers`.
 */
export interface ILayerConfig {
	/**
	 * Unique identifier used as the `scope` argument (e.g. `core`, `api`,
	 * `frontend`). Must be a valid identifier: lowercase, hyphens allowed.
	 */
	readonly name: string;
	/** Human-readable label shown in the brief header. */
	readonly label: string;
	/**
	 * Workspace-relative directories or files the LLM must read.
	 * Supports glob-like descriptions (e.g. `src/lib/`, `packages/core/src/`).
	 */
	readonly paths: readonly string[];
	/**
	 * Additional layer-specific checks to append to the generic checklist.
	 * Each string is rendered as a bullet point in the reading-phase section.
	 */
	readonly checks?: readonly string[];
}

// ---------------------------------------------------------------------------
// Scoring dimensions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Brief options
// ---------------------------------------------------------------------------

/** Options that customise {@link buildBrief}'s output. */
export interface IBriefOptions {
	/** Custom scoring dimensions. Defaults to {@link SCORE_DIMENSIONS}. */
	readonly dimensions?: readonly string[];
	/**
	 * Host-configured layers. Passed by the plugin's `register` from
	 * `ctx.options.layers`. Used when `scope` is a layer name or `'full'`.
	 */
	readonly layers?: readonly ILayerConfig[];
}

// ---------------------------------------------------------------------------
// Cross-cutting invariants (appear in every scope)
// ---------------------------------------------------------------------------

const CROSS_CUTTING = `
### ⚠️ Invariantes transversales (siempre, independientemente del alcance)

Estos tres puntos se verifican en **cualquier** alcance de auditoría:

- **\`mcp-vertex_metrics\`** — es la primitiva canónica de observabilidad. Verifica que esté presente, que persista su estado entre llamadas, y que un snapshot-diff entre dos invocaciones refleje la actividad real del host.
- **\`ctx.keepLegacy\`** — cada plugin debe honrar o ignorar **explícitamente** este flag. Nunca dejarlo sin mencionar en código ni en docs.
- **\`tool-outputs.ts\`** — todo plugin con \`outputSchema\` tipado debe tener su \`src/generated/tool-outputs.ts\` generado y commiteado (\`bun run types:generate\`). Si el archivo está ausente o desfasado, es un hallazgo.
`;

// ---------------------------------------------------------------------------
// Universal reading phases (repo-agnostic)
// ---------------------------------------------------------------------------

const PHASE_SECURITY = `
### Fase — Seguridad operacional

- **Escrituras atómicas**: traza cada path de escritura durable y verifica que usa primitivas de escritura atómica (tmp-file + rename o equivalente del framework). Un \`writeFile\` desnudo en datos compartidos es hallazgo FATAL.
- **Redacción de secretos**: ¿se aplica \`redactSecrets\` (o equivalente) antes de persistir cualquier texto del usuario?
- **Contención de paths**: ¿todo input de path está validado contra el workspace root? Una ruta \`../\` que escape es FATAL.
- **I/O síncrono en hot paths**: \`*Sync\` en handlers de tools/requests es MUY_MAL.
- **\`@ts-ignore\` / supresiones de tipos**: cualquier ocurrencia en producción es hallazgo.
- **Secrets hardcodeados**: API keys, tokens, endpoints privados en fuente.
`;

const PHASE_TOKENS = `
### Fase — Eficiencia de tokens

- Confirma que el tool de orientación principal (\`overview\` o equivalente) se mantiene bajo el presupuesto documentado.
- ¿Alguna descripción de tool con prosa redundante (explica lo mismo que el nombre del parámetro)?
- ¿Instrucciones de sistema comprimibles sin perder semántica?
- Traza el path frío de un agente nuevo: ¿cuántas llamadas necesita antes de poder trabajar? ¿Es el mínimo posible?
- ¿El sistema evita re-lecturas innecesarias de recursos no modificados (hashing, digest, cache)?
`;

const PHASE_TESTS = `
### Fase — Tests

Lee los spec files de los engines más críticos:
- ¿Paths de concurrencia cubiertos? (dos escritores simultáneos)
- ¿Snapshots stale?
- ¿Los specs testean contratos o detalles de implementación?
- ¿Falta fuzzing / property-based testing en lógica de parsing con múltiples capas de validación?

Flag: módulo con >300 LOC y <3 spec files = riesgo de undertest (hallazgo MEJORABLE).
Patrón canónico: specs colocados junto al código; usan mocks/stubs inyectados, no globals.
`;

const PHASE_DOCS = `
### Fase — Documentación

- **Guías de agente / AGENTS.md**: para cada regla definida, ¿hay alguna violación en el código que la contradiga?
- **Skills**: abre cada skill y verifica: ¿nombres de tools correctos? ¿Paths que aún existen? ¿Hay tools nuevas no mencionadas?
- **Scaffolds / plantillas**: ¿describen correctamente la práctica actual o están desfasados?
- **READMEs de módulos**: ¿actualizados tras los últimos cambios significativos?
- **Scripts**: ¿algún archivo en directorios de scripts con extensión prohibida por las reglas del repo?
`;

// ---------------------------------------------------------------------------
// Generic layer reading phase (parameterised by ILayerConfig)
// ---------------------------------------------------------------------------

const buildLayerPhase = (layer: ILayerConfig): string => {
	const pathsList = layer.paths.map((p) => `  - \`${p}\``).join('\n');
	const extraChecks =
		layer.checks && layer.checks.length > 0
			? '\n\n**Checks adicionales específicos de esta capa:**\n' +
				layer.checks.map((c) => `- ${c}`).join('\n')
			: '';

	return `
### Fase — ${layer.label}

Lee exhaustivamente los siguientes directorios/archivos:
${pathsList}

Para cada fichero que toques, extrae el snippet exacto (≤ 15 líneas) y cita \`archivo:línea\`.

Checklist genérico de capa:
- **I/O síncrono en hot paths**: \`readFileSync\`, \`existsSync\`, etc. en handlers o rutas calientes = MUY_MAL.
- **Globals mutables / \`process.cwd()\`**: paths y configuración deben venir de la inyección de contexto, no de variables globales.
- **Escrituras sin protección**: cualquier \`writeFile\` / escritura de estado compartido sin mutex + write-atomic = FATAL.
- **\`@ts-ignore\` / \`@ts-nocheck\` / \`console.log\`** en código de producción: cita la línea.
- **Contratos públicos honrados**: ¿la capa respeta las interfaces que declara exponer?
- **Duplicación de lógica**: ¿hay utilidades copiadas de otra capa que deberían estar en un módulo compartido?${extraChecks}
`;
};

// ---------------------------------------------------------------------------
// Brief builder
// ---------------------------------------------------------------------------

/**
 * Build the audit brief in markdown.
 *
 * @param scope - Either a universal scope identifier or the `name` of a
 *   host-configured layer. Pass `'full'` for a complete audit.
 * @param options - Optional overrides for dimensions and layer definitions.
 */
export const buildBrief = (
	scope: string,
	options: IBriefOptions = {},
): string => {
	const dimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const layers = options.layers ?? [];
	const dimensionsTable = dimensions.map((d) => `| ${d} | /10 |`).join('\n');

	// Resolve label: universal scope label, layer label, or raw scope string.
	const universalLabel =
		scope in SCOPE_LABEL
			? SCOPE_LABEL[scope as UniversalAuditScope]
			: undefined;
	const layerConfig = layers.find((l) => l.name === scope);
	const scopeLabel =
		universalLabel ?? layerConfig?.label ?? `Capa personalizada: ${scope}`;

	// Build the reading phases appropriate for this scope.
	const readingPhases = buildReadingPhases(scope, layers);

	return `# 📋 Brief de auditoría (alcance: ${scopeLabel})

> **Fecha**: <YYYY-MM-DD> · **Revisor**: <Modelo + Host> · **Metodología**: Lectura
> exhaustiva del código del alcance indicado. **Los comandos automatizados son el
> punto de partida, no el fin.** El modelo DEBE leer el código real, extraer snippets
> con referencias \`archivo#Lnn\`, y justificar cada hallazgo con evidencia concreta.
> Auditorías que solo resumen output de comandos son inválidas.
>
> Si tu salida se aleja del formato, la herramienta \`audit_consolidate\` no podrá
> deduplicar tus hallazgos contra los de otros revisores.

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
- Tests: \`<comando de tests del repo>\` — cuenta y estado pass/fail.
- Build: \`<comando de build>\` — output limpio o errores.
- Linter: \`<comando de lint>\` — warnings/errors.
- LOC aproximado del alcance.

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Assemble the reading-phase sections for the requested scope.
 * `full` includes all universal phases + all configured layers.
 * A universal scope includes only its own phase.
 * A layer name includes only that layer's generic reading phase.
 * Unknown scopes get all universal phases (safe fallback).
 */
const buildReadingPhases = (
	scope: string,
	layers: readonly ILayerConfig[],
): string => {
	const universalPhaseMap: Record<UniversalAuditScope, string> = {
		full: '', // handled below
		security: PHASE_SECURITY,
		tokens: PHASE_TOKENS,
		tests: PHASE_TESTS,
		docs: PHASE_DOCS,
	};

	if (scope === 'full') {
		const layerPhases =
			layers.length > 0
				? layers.map(buildLayerPhase).join('\n')
				: `
### Fase — Código fuente del proyecto

No hay capas configuradas. Lee los directorios principales del proyecto:
busca los mismos patrones del checklist genérico en todo el código fuente.
Añade capas en \`mcp-vertex.config.json → plugins.audit.options.layers\` para
obtener instrucciones de lectura específicas por capa en próximas auditorías.
`;
		return (
			CROSS_CUTTING +
			layerPhases +
			PHASE_SECURITY +
			PHASE_TOKENS +
			PHASE_TESTS +
			PHASE_DOCS
		);
	}

	// Universal scope (security, tokens, tests, docs)
	if (scope in universalPhaseMap && scope !== 'full') {
		return CROSS_CUTTING + universalPhaseMap[scope as UniversalAuditScope];
	}

	// Layer scope
	const layer = layers.find((l) => l.name === scope);
	if (layer) {
		return CROSS_CUTTING + buildLayerPhase(layer);
	}

	// Unknown scope — safe fallback: all universal phases
	return (
		CROSS_CUTTING + PHASE_SECURITY + PHASE_TOKENS + PHASE_TESTS + PHASE_DOCS
	);
};
