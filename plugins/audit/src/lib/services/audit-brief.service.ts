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
// Re-exports from `audit-brief.constants.ts` for backwards compatibility.
// The canonical definitions live in the constants module; this file keeps
// the public surface stable by re-exporting the same names.
//
// SOLID — the constants module owns type unions, scope tables, layer
// config, score dimensions, the universal reading phases, and the
// cross-cutting invariant defaults (SRP). This service file is now a
// pure function over those inputs.
export {
	ALL_SCOPES,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_SCOPES,
} from './audit-brief.constants';
export type {
	ILayerConfig,
	UniversalAuditScope,
} from './audit-brief.constants';
import {
	CROSS_CUTTING_UNIVERSAL_DEFAULTS,
	type ILayerConfig,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_PHASES,
	type UniversalAuditScope,
} from './audit-brief.constants';

/**
 * Public short alias for {@link UniversalAuditScope}. Kept for backwards
 * compatibility with downstream consumers (e.g. the plugin's
 * `src/public/index.ts`, the `audit_plan` tool, external hosts) that
 * historically imported `AuditScope`. New code should prefer
 * `UniversalAuditScope` directly; this alias is the single source of truth
 * that satisfies both call sites without forcing every plugin to ship two
 * type names.
 */
export type AuditScope = UniversalAuditScope;

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
	/**
	 * Human-readable project name, rendered in the brief header and in
	 * the "no layers configured" fallback. Defaults to `"the project"`.
	 * Keep the value generic — the brief is meant to land in any model
	 * session and should not assume mcp-vertex-specific vocabulary.
	 */
	readonly projectName?: string;
	/**
	 * Path to the host config file, rendered in the "no layers
	 * configured" hint. Defaults to `"<config-file>"` (a placeholder).
	 * Hosts that want to point the model at a concrete file (e.g.
	 * `mcp-vertex.config.json`, `app.toml`, `settings.yaml`) can pass it
	 * here without leaking that path into the agnostic default brief.
	 */
	readonly configFileName?: string;
	/**
	 * Optional list of extra cross-cutting invariants the host wants
	 * every scope to surface. Each entry is rendered as a bullet under
	 * the "Invariantes transversales" block, before the universal
	 * defaults. Use this to inject project-specific "must check this"
	 * rules without forking `buildBrief`.
	 */
	readonly crossCuttingAdditions?: readonly string[];
}

// ---------------------------------------------------------------------------
// Cross-cutting renderer (pure function over its inputs)
// ---------------------------------------------------------------------------

/**
 * Render the cross-cutting invariants block. Universal defaults come
 * first, then the host's `crossCuttingAdditions`. Kept as a function
 * (not a constant in the constants module) because it builds markdown
 * from a join — that is logic, not data, and belongs in the service.
 */
const renderCrossCutting = (additions: readonly string[]): string => {
	const bullets = [...CROSS_CUTTING_UNIVERSAL_DEFAULTS, ...additions].join(
		'\n',
	);
	return `
### ⚠️ Invariantes transversales (siempre, independientemente del alcance)

Estos puntos se verifican en **cualquier** alcance de auditoría:

${bullets}
`;
};

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
 * @param options - Optional overrides for dimensions, layer definitions,
 *   project name, config-file hint, and host-specific cross-cutting
 *   invariants. Defaults are project-agnostic on purpose; pass options
 *   to brand the output for a specific host.
 */
export const buildBrief = (
	scope: string,
	options: IBriefOptions = {},
): string => {
	const dimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const layers = options.layers ?? [];
	const projectName = options.projectName ?? 'the project';
	const configFileName = options.configFileName ?? '<config-file>';
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
	const readingPhases = buildReadingPhases(scope, layers, {
		layers,
		projectName,
		configFileName,
		...(options.crossCuttingAdditions !== undefined
			? { crossCuttingAdditions: options.crossCuttingAdditions }
			: {}),
	});

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

interface IBuildReadingPhasesOptions {
	readonly layers: readonly ILayerConfig[];
	readonly projectName: string;
	readonly configFileName: string;
	readonly crossCuttingAdditions?: readonly string[];
}

/**
 * Assemble the reading-phase sections for the requested scope.
 * `full` includes all universal phases + all configured layers.
 * A universal scope includes only its own phase.
 * A layer name includes only that layer's generic reading phase.
 * Unknown scopes get all universal phases (safe fallback).
 *
 * The cross-cutting invariants block is rendered by {@link renderCrossCutting}
 * with the host's `crossCuttingAdditions` appended to the universal
 * defaults; this keeps the brief agnostic for hosts that never set the
 * additions and self-explanatory for hosts that do.
 */
const buildReadingPhases = (
	scope: string,
	layers: readonly ILayerConfig[],
	options: IBuildReadingPhasesOptions = {
		layers: [],
		projectName: 'the project',
		configFileName: '<config-file>',
	},
): string => {
	const crossCutting = renderCrossCutting(
		options.crossCuttingAdditions ?? [],
	);

	if (scope === 'full') {
		const layerPhases =
			layers.length > 0
				? layers.map(buildLayerPhase).join('\n')
				: `
### Fase — Código fuente de ${options.projectName}

No hay capas configuradas. Lee los directorios principales del proyecto:
busca los mismos patrones del checklist genérico en todo el código fuente.
Añade capas en la sección \`plugins.audit.options.layers\` de \`${options.configFileName}\`
para obtener instrucciones de lectura específicas por capa en próximas auditorías.
`;
		return (
			crossCutting +
			layerPhases +
			UNIVERSAL_PHASES.security +
			UNIVERSAL_PHASES.tokens +
			UNIVERSAL_PHASES.tests +
			UNIVERSAL_PHASES.docs
		);
	}

	// Universal scope (security, tokens, tests, docs)
	if (scope in UNIVERSAL_PHASES && scope !== 'full') {
		return (
			crossCutting +
			UNIVERSAL_PHASES[scope as Exclude<UniversalAuditScope, 'full'>]
		);
	}

	// Layer scope
	const layer = layers.find((l) => l.name === scope);
	if (layer) {
		return crossCutting + buildLayerPhase(layer);
	}

	// Unknown scope — safe fallback: all universal phases
	return (
		crossCutting +
		UNIVERSAL_PHASES.security +
		UNIVERSAL_PHASES.tokens +
		UNIVERSAL_PHASES.tests +
		UNIVERSAL_PHASES.docs
	);
};
