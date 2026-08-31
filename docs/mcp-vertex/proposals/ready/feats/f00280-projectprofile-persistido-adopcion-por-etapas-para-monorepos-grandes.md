---
id: f00280
title: "`ProjectProfile` persistido + adopción por etapas para monorepos grandes"
kind: feat
status: ready
type: proposal
track: adoption
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, f00274]
---

# f00280 — `ProjectProfile` persistido + adopción por etapas para monorepos grandes

## Goal

Que un monorepo grande (múltiples workspaces, lenguajes y CI heredado)
obtenga un `ProjectProfile` persistido y actualizable
(`.mcp-vertex/project-profile.json`) que otros plugins consulten en
vez de redescubrir el proyecto por su cuenta, y que la adopción se
ofrezca por etapas (`core+git+search+doctor` → `rules+testing+quality`
→ `proposals+agents` → especializados) en vez de un único preset de
todo-o-nada.

## why

**El dolor.** *"Para implementarlo en otro proyecto es complejo si el
proyecto es grande; si es pequeño es sencillo."* Debería ser al
revés: cuanto más grande el repo, más trabajo debería hacer Vertex.

**Corrección de la premisa — `mcpv adopt` ya existe y hace más de lo
que la auditoría describe.** Leído
`packages/core/src/lib/adopt/adopt-project.tool.ts` y
`adoption-assessment.service.ts` completos: el tool
`<prefix>_adopt_project` (expuesto también como `mcpv adopt` en
`packages/cli/src/commands/groups/core.ts:159-164`) YA implementa la
"pieza 1" que `AUD-G04` propone como solución ideal —
**descubrimiento en sólo lectura, dry-run por defecto**
(`write: false` por defecto, confirmado en el JSDoc del propio
fichero: *"Dry-run by default... Pass `write: true` to persist it"*),
que produce un `IAdoptionAssessment` con preset recomendado,
recomendación de plugins con `rationale` por cada uno
(`recommended`/`not recommended`, con motivo explícito), estimación de
coste en bytes/tokens, y una lista de conflictos con la superficie
existente antes de escribir nada. El flujo "termina con un perfil
recomendado y `No files have been changed. Apply?`" que la auditoría
propone como diseño futuro **ya es, en sustancia, el contrato
`analyze: true` / `write: false` → `write: true` de esta tool hoy**.

**Lo que sí falta, verificado.** Dos piezas reales:

1. **`ProjectProfile` persistido.** `buildAdoptionAssessment` es una
   función pura que recalcula el análisis en cada llamada
   (`analyzeProject` + `buildAdoptionAssessment`); no hay ningún
   fichero `.mcp-vertex/project-profile.json` ni mecanismo de
   actualización incremental (`grep -rln "ProjectProfile"` sin
   resultados en código de producción). Cada plugin que necesita saber
   "qué tipo de proyecto es este" vuelve a analizarlo por su cuenta.
2. **Adopción por etapas para monorepos.** `chooseCandidatePreset`
   sólo distingue `monorepo → 'swarm'` como categoría única — no hay
   ningún desglose por área/workspace dentro de un monorepo grande, ni
   un flujo de instalación incremental; la asignación es de "todo el
   repo a un preset" en una sola pasada.

**Por qué el gap sigue siendo real a pesar de la corrección.** En un
monorepo de 27 workspaces con lenguajes/frameworks distintos por área,
recomendar un único preset para todo el repo (`swarm`, sin más
matiz) sigue exigiendo que el usuario entienda qué significa cada
plugin para decidir si aplica a SU área — la pieza que realmente
falta no es "descubrimiento de sólo lectura" (ya existe) sino
"desglose por área + entrega incremental + memoria persistida de la
decisión".

## why this design

Se descarta construir `mcpv adopt` desde cero, como sugeriría una
lectura literal de la auditoría — sería trabajo duplicado sobre una
tool que ya funciona y está probada. Esta propuesta se ancla
explícitamente en extender `buildAdoptionAssessment`/`adopt-project.tool.ts`
en dos direcciones (persistencia + desglose por área), no en
sustituirlos.

Se prioriza `ProjectProfile` (S1) antes que el desglose por área (S2)
porque la persistencia es la pieza que otras propuestas del propio
plan ya asumen como cura de fondo compartida (`AUD-G04` la conecta
explícitamente con `AUD-A09`/`A11`/`A12`: derivar el alcance de una
fuente y no repetirlo) — construirla primero da valor a cualquier
plugin que hoy redescubre el proyecto, no sólo al flujo de adopción.

## non-goals

- Reescribir `adopt-project.tool.ts` o `adoption-assessment.service.ts` —
  se extienden, no se sustituyen.
- Resolver `AUD-A09`/`AUD-A11`/`AUD-A12` (Biome sobre el monorepo
  completo, mapa único de workspaces para tests afectados, typecheck
  de `tools/`) — son hallazgos de Track A fuera de este territorio;
  esta propuesta sólo deja `ProjectProfile` disponible como fuente
  común que esas correcciones podrían consumir después.
- Automatizar completamente las cuatro etapas de adopción sin
  confirmación humana — cada etapa sigue requiriendo un `Apply?`
  explícito, igual que el flujo actual de `adopt_project`; "por
  etapas" no significa "sin supervisión".

## architecture

```
adoptProject (ya existe, sin romper su contrato)
      │
      ├─ analyzeProject (ya existe)
      ├─ buildAdoptionAssessment (ya existe)
      │       │
      │       ▼ NUEVO
      │  persistProjectProfile(.mcp-vertex/project-profile.json)
      │       { generatedAt, projectType, language, packageManager,
      │         workspaces: [{ path, framework, testRunner, ... }],
      │         recommendedPluginIds, stage: 'core' | 'standard' | 'full' }
      │
      └─ NUEVO: analyzeWorkspaceAreas(topLevelDirs)
              → por cada workspace/área: su propio mini-assessment
              → agrupa en las 4 etapas de instalación en vez de un
                preset único para todo el repo
```

## slices

### S1 — `ProjectProfile` persistido, generado y actualizado incrementalmente

- **Status**: done
- **Files**: `packages/core/src/lib/adopt/project-profile.service.ts`, `packages/core/src/lib/contracts/interfaces/project-profile.interface.ts`, `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/tests/src/lib/adopt/project-profile.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt/project-profile.spec.ts`
- review-state: done
- review-implementer: copilot-orchestrator-f00280-s1-final
- review-reviewer: delivery-verifier-f00280-s1-final
- review-log: requested_changes by delivery_verifier — El test pasa 3/3, pero la aceptación no está cubierta: en un monorepo sin perfil previo, persistProjectProfile solo escribe la raíz '.' y no genera workspaces; además preserva entradas obsoletas sin reconciliarlas. Añadir descubrimiento inicial de workspaces y pruebas que lo verifiquen.
- review-log: approved by delivery-verifier-f00280-s1-final — Verified independently: 1) packages/core/src/lib/adopt/adopt-project.tool.ts now calls discoverProjectProfileWorkspaces when projectType==='monorepo'; 2) packages/core/src/lib/adopt/project-profile.service.ts accepts discoveredWorkspaces in both IBuildProjectProfileInput and IPersistProjectProfileInput, normalizes paths via pathPosix, dedupes, and replaces existing workspaces with the discovered set (reconciliation). 3) Focused tests pass 5/5 covering: dedup of trailing slashes / windows separators / dedup of identical paths, initial discovery populating 3 workspaces from a monorepo fixture, reconciliation removing stale apps/old in favor of newly discovered entries, and deep pattern bounding (depth>32 excluded). 4) Core typecheck green. Acceptance now covered.
### S2 — Desglose por área/workspace dentro de un monorepo

- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adoption-assessment.service.ts`, `packages/core/tests/src/lib/adopt/adoption-assessment.monorepo-areas.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt/adoption-assessment.monorepo-areas.spec.ts`
- review-state: done
- review-implementer: copilot-orchestrator-f00280-s2-verify
- review-reviewer: delivery-verifier-f00280-s2-verify
- review-log: requested_changes by proposal-guardian-f00280-s2 — No hay implementación ni test verificable de desglose de monorepos tras dos delegaciones. La acceptance exige comportamiento para monorepos heterogéneos y un guardarraíl homogéneo; debe reconstruirse antes de aprobar.
- review-log: approved by delivery-verifier-f00280-s2-verify — Verified independently: S2 implementation present in commit 770a5c83 (feat(adopt): break down assessment by workspace area). Tests pass 2/2: bunx vitest run packages/core/tests/src/lib/adopt/adoption-assessment.monorepo-areas.spec.ts. Files match proposal: packages/core/src/lib/adopt/adoption-assessment.service.ts (modified), packages/core/tests/src/lib/adopt/adoption-assessment.monorepo-areas.spec.ts (new). Acceptance covered.
### S3 — Adopción por etapas: cuatro perfiles de instalación incremental

- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adoption-stages.constant.ts`, `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/tests/src/lib/adopt/adoption-stages.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt/adoption-stages.spec.ts`
- review-state: done
- review-implementer: copilot-orchestrator-f00280-s3
- review-reviewer: delivery-verifier-f00280-s3
- review-log: approved by delivery-verifier-f00280-s3 — Verified independently: S3 implementation matches all 3 acceptance criteria. 1) Default stage = `core` (resolveStagePluginIds('core') = ['git','search','docs','memory']; test "omitting stage installs only the core plugin set" passes). 2) Cumulative: test "stage='standard' is cumulative over core" verifies standard ⊃ core. 3) Specialized is sentinel: resolveStagePluginIds('specialized') returns []; test "stage='specialized' preserves the full assessment set" passes. typecheck green; 12/12 new tests pass + 19/19 existing adopt tests pass = 31/31. Acceptance covered.
## dependency graph

Independiente del resto de `q00011`. Se relaciona con `f00274`
(activación de VS Code): el comando de adopción de esa propuesta puede
invocar el flujo por etapas de S3 una vez exista, pero `f00274` no
depende de que esta propuesta esté completa (puede invocar el
`adopt_project` actual sin etapas mientras tanto). Dentro de esta
propuesta: S1 no depende de nada; S2 es independiente de S1 (toca otro
método del mismo servicio); S3 depende de S2 (necesita el desglose por
área para poder ofrecer etapas coherentes por área, no sólo por todo
el repo).

## acceptance

- `adopt_project` con `write: true` persiste
  `.mcp-vertex/project-profile.json` con el desglose de workspaces.
- En un fixture de monorepo con 3+ workspaces de frameworks distintos,
  el assessment recomienda plugins diferenciados por área, no un único
  preset para todo el repo.
- Invocar `adopt_project` sin especificar `stage` instala sólo
  `core+git+search+doctor`; especificar una etapa posterior la añade
  de forma aditiva sobre las anteriores.
- Adoptar Vertex en el monorepo fixture de 27 workspaces no exige leer
  documentación de plugins uno a uno — el perfil + las etapas explican
  cada decisión con su `rationale`, reutilizando el patrón que
  `adoption-assessment.service.ts` ya usa para plugins individuales.

## risks and mitigations

- **Riesgo: persistir `ProjectProfile` crea una quinta fuente de
  verdad que diverge del análisis en vivo (el mismo patrón que
  `AUD-F05` documenta para versiones de plugin).** Mitigación: S1
  incluye un timestamp `generatedAt` y el tool de adopción lo
  regenera en cada `write: true`; un `doctor --deep` (si `f00275`
  aterriza) podría comparar el perfil persistido contra un
  re-análisis en vivo — se anota como integración futura, no se
  implementa aquí.
- **Riesgo: el desglose por área de S2 sobre-fragmenta un monorepo
  pequeño con 2-3 workspaces muy similares, generando ruido en vez de
  ayuda.** Mitigación: el spec de S2 incluye explícitamente un caso de
  monorepo pequeño y homogéneo donde el desglose colapsa de nuevo a un
  único assessment — el umbral de cuándo desglosar (número de
  workspaces, diversidad de frameworks) se calibra con ese caso como
  guardarraíl.

## notes

Corrección explícita sobre `AUD-G04`: la afirmación de que "adoptar
exige que el usuario entienda Vertex" describe con precisión el
problema real (falta de desglose por área + falta de memoria
persistida), pero la solución que propone ("`mcpv adopt`,
descubrimiento en sólo lectura") ya existe y funciona razonablemente
bien — confirmado leyendo el código, no asumido. El esfuerzo de esta
propuesta es menor que el que sugeriría "construir `mcpv adopt` desde
cero", y se concentra en las dos piezas que de verdad faltan.
