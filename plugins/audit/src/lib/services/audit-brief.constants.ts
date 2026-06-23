/**
 * audit-brief.constants.ts — pure data for the audit brief.
 *
 * Extracted from `audit-brief.service.ts` so `buildBrief` is a pure
 * function over its inputs, not a 500-line module that mixes types,
 * tables, renderers, and the brief assembly.
 *
 * SOLID contract for this module:
 *   - SRP — every export below is data. No markdown is *built* here;
 *          no I/O happens; no function is exported. The service
 *          module owns the rendering and the assembly.
 *   - OCP — adding a new universal scope is a one-line edit to
 *          `UNIVERSAL_SCOPES` + a key in `SCOPE_LABEL` + a key in
 *          `UNIVERSAL_PHASES`. The brief renderer does not change.
 *   - DIP — the brief service depends on these constants through
 *          their named exports, not on a hidden global.
 *   - LSP — every export is a primitive value (`string[]`, `Record`,
 *          `string`, or a type alias). Substituting a more specific
 *          instance (e.g. a host that wants localised labels) is a
 *          drop-in replacement.
 */

/** Universal scope identifiers, in canonical order. Adding a new one
 *  is a one-line edit here + a key in `SCOPE_LABEL`; the brief
 *  renderer auto-discovers it. */
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

/**
 * A host-defined layer scope that the agent will read exhaustively.
 * Configured via the host project's audit plugin options (typically
 * under `plugins.audit.options.layers`).
 */
export interface ILayerConfig {
	/**
	 * Unique identifier used as the `scope` argument (e.g. `core`,
	 * `api`, `frontend`). Must be a valid identifier: lowercase,
	 * hyphens allowed.
	 */
	readonly name: string;
	/** Human-readable label shown in the brief header. */
	readonly label: string;
	/**
	 * Workspace-relative directories or files the LLM must read.
	 * Supports glob-like descriptions (e.g. `src/lib/`,
	 * `packages/core/src/`).
	 */
	readonly paths: readonly string[];
	/**
	 * Additional layer-specific checks to append to the generic
	 * checklist. Each string is rendered as a bullet point in the
	 * reading-phase section.
	 */
	readonly checks?: readonly string[];
}

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
// Universal reading phases (repo-agnostic, project-agnostic)
// ---------------------------------------------------------------------------

/**
 * Reading-phase markdown bodies keyed by universal scope. The brief
 * renderer picks one based on the `scope` argument and concatenates
 * it with the cross-cutting invariants block. Each phase is a
 * complete markdown section (with its own `### Fase —` heading) so
 * the model can read the brief top-down and find the section it
 * needs.
 *
 * Pure data, no side effects — the brief builder is the only consumer.
 * Lifting these strings into a constants module keeps `buildBrief` a
 * pure function of its inputs (SRP) and makes the phases easy to
 * test in isolation (pin the markdown, no need to render a full brief).
 *
 * The `full` key is intentionally empty: `full` is a fan-out that
 * concatenates every other phase plus the configured layers; the
 * renderer treats it as a special case.
 */
export const UNIVERSAL_PHASES: Readonly<Record<UniversalAuditScope, string>> = {
	full: '',
	security: `
### Fase — Seguridad operacional

- **Escrituras atómicas**: traza cada path de escritura durable y verifica que usa primitivas de escritura atómica (tmp-file + rename o equivalente del framework). Un \`writeFile\` desnudo en datos compartidos es hallazgo FATAL.
- **Redacción de secretos**: ¿se aplica \`redactSecrets\` (o equivalente) antes de persistir cualquier texto del usuario?
- **Contención de paths**: ¿todo input de path está validado contra el workspace root? Una ruta \`../\` que escape es FATAL.
- **I/O síncrono en hot paths**: \`*Sync\` en handlers de tools/requests es MUY_MAL.
- **\`@ts-ignore\` / supresiones de tipos**: cualquier ocurrencia en producción es hallazgo.
- **Secrets hardcodeados**: API keys, tokens, endpoints privados en fuente.
`,
	tokens: `
### Fase — Eficiencia de tokens

- Confirma que el tool de orientación principal (\`overview\` o equivalente) se mantiene bajo el presupuesto documentado.
- ¿Alguna descripción de tool con prosa redundante (explica lo mismo que el nombre del parámetro)?
- ¿Instrucciones de sistema comprimibles sin perder semántica?
- Traza el path frío de un agente nuevo: ¿cuántas llamadas necesita antes de poder trabajar? ¿Es el mínimo posible?
- ¿El sistema evita re-lecturas innecesarias de recursos no modificados (hashing, digest, cache)?
`,
	tests: `
### Fase — Tests

Lee los spec files de los engines más críticos:
- ¿Paths de concurrencia cubiertos? (dos escritores simultáneos)
- ¿Snapshots stale?
- ¿Los specs testean contratos o detalles de implementación?
- ¿Falta fuzzing / property-based testing en lógica de parsing con múltiples capas de validación?

Flag: módulo con >300 LOC y <3 spec files = riesgo de undertest (hallazgo MEJORABLE).
Patrón canónico: specs colocados junto al código; usan mocks/stubs inyectados, no globals.
`,
	docs: `
### Fase — Documentación

- **Guías de agente / AGENTS.md** (o equivalente: \`CONTRIBUTING.md\`, \`CONVENTIONS.md\`, \`docs/agent.md\`): para cada regla definida, ¿hay alguna violación en el código que la contradiga?
- **Skills / runbooks / playbooks**: abre cada uno y verifica: ¿nombres de tools correctos? ¿Paths que aún existen? ¿Hay tools nuevas no mencionadas? ¿Algún ejemplo de output desactualizado?
- **Scaffolds / plantillas / generators**: ¿describen correctamente la práctica actual o están desfasados?
- **READMEs de módulos**: ¿actualizados tras los últimos cambios significativos?
- **Reglas declaradas en código (lint, typecheck, scripts de CI)**: ¿están en sync con las reglas narradas en docs? Un doc que dice "no X" sin un lint que lo enforce es hallazgo MEJORABLE.
`,
};

// ---------------------------------------------------------------------------
// Cross-cutting invariants (universal defaults — data only)
// ---------------------------------------------------------------------------

/**
 * Universal defaults for the "cross-cutting invariants" block. These
 * are project-agnostic on purpose: every host benefits from checking
 * them, regardless of language or framework. Hosts that have additional
 * invariants they want surfaced in every scope can pass them via
 * `IBriefOptions.crossCuttingAdditions`; they are rendered AFTER the
 * universal defaults so the brief stays self-explanatory.
 *
 * The historical (mcp-vertex-specific) defaults — `mcp-vertex_metrics`,
 * `ctx.keepLegacy`, `tool-outputs.ts` — were promoted to **host-added**
 * invariants because they describe one project's vocabulary. Other
 * projects will have their own observability primitive, their own
 * keep-legacy semantics, their own generated-typed-outputs workflow.
 * Hosts wire those via `crossCuttingAdditions` from `register()`.
 */
export const CROSS_CUTTING_UNIVERSAL_DEFAULTS: readonly string[] = [
	'- **Observabilidad**: identifica la primitiva canónica del proyecto (métricas, tracing, logs estructurados, lo que sea) y verifica que esté presente, que persista su estado entre llamadas, y que un snapshot-diff entre dos invocaciones refleje la actividad real del host. Si no existe, es hallazgo MEJORABLE; si existe pero miente, es FATAL.',
	'- **Honoring de flags de configuración**: cada flag opt-in documentado (legacy, migración, dry-run, allow-list, etc.) debe estar **explícitamente honrado o explícitamente ignorado** en el código. Un flag mencionado en docs pero sin efecto verificable en código es hallazgo MEJORABLE.',
	'- **Outputs tipados generados**: si el proyecto genera tipos a partir de schemas (typed SDK, JSON Schema, OpenAPI, etc.) los archivos generados deben estar commiteados y regenerarse como parte del gate de validación. Un `<generated>` ausente o desfasado respecto a su fuente es hallazgo.',
];
