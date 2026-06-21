---
id: a00022
kind: audit
title: "Auditoría Unificada — consolidación de a00021/a00026/a00024/a00025/a00023 (2026-06-21)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: proposal_guardian, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# a00022 — Auditoría Unificada — consolidación de a00021/a00026/a00024/a00025/a00023

## Goal

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `apps/*`, `plugins/*`, `examples/*`, `docs/proposals/`). Esta auditoría no re-audita el código desde cero: **consolida** cinco auditorías independientes que cubrieron el mismo alcance casi al mismo tiempo, deduplica sus hallazgos contra el código actual y contra las propuestas `ready/` ya existentes, y deja **solo** los puntos genuinamente accionables.
- **Auditorías consolidadas** (todas `status: ready`, fechadas 2026-06-21, todas en `docs/proposals/ready/` al momento de esta consolidación):
  - **a00021** — Antigravity (Gemini 3.5 Flash) — repositorio completo.
  - **a00026** — GitHub Copilot (MiniMax-M3) — repositorio completo.
  - **a00024** — GitHub Copilot (GPT-5.4) — repositorio completo.
  - **a00025** — GitHub Copilot (MiniMax-M3) — estudio de ahorro de tokens (meta-estudio, naturaleza distinta a las otras 4).
  - **a00023** — Claude Code (Sonnet 4.6) — repositorio completo.
- **Audited HEAD**: HEAD de `develop` al cierre de esta consolidación (post `efca64a`, mismo árbol que auditó `a00023`).
- **Revisor / Model**: Claude Code (Sonnet 4.6), en rol de consolidador — no repite el trabajo de lectura de código de las 5 auditorías base; cruza sus hallazgos deduplicados (ya investigados con grep/lectura directa antes de escribir este documento) contra el estado real del árbol y contra el board de propuestas `ready/`.
- **Date**: 2026-06-21.

## Why

Las cuatro auditorías de repositorio (`a00021`, `a00026`, `a00024`, `a00023`) auditaron el mismo alcance casi en simultáneo y convergen en el mismo veredicto (8.4–9.6/10, sin hallazgos FATAL): arquitectura núcleo-plugin de referencia, primitivas durables consistentes, sin huecos de diseño — la distancia al ideal es de **acabados de plataforma**, no de rediseño. Al cruzar sus hallazgos contra el código de hoy: **8 puntos ya estaban resueltos en disco** (verificados con grep/lectura directa), **6 puntos ya tienen una propuesta `ready/` que los cubre** (no se duplica slice), y **7 puntos no tienen cobertura** y se materializan aquí como slices nuevos. La quinta auditoría (`a00025`) es un meta-estudio de eficiencia de tokens con su propio plan de derivación (`a024a/b/c/d`); se trata en una sección separada (§ Estudio de eficiencia de tokens) porque su naturaleza no es "hallazgo de calidad de código" sino "diseño de un programa de medición".

**Veredicto consolidado: ~8.8/10** (promedio de los 4 scores de repositorio: 9.6 + 8.7 + 8.4 + 8.5 = 8.8). Ningún revisor encontró un hallazgo FATAL. El patrón es consistente entre los 4: el núcleo y `proposals`/`memory` están en estado de referencia; la deuda vive en plugins satélite (I/O síncrono puntual), cobertura de gate (`extensions/vscode` fuera del root), y superficie de empaquetado/release (smoke de tarball incompleto).

## Non-goals

- Re-ejecutar la auditoría de código desde cero. Este documento parte de la investigación de cross-referencing ya hecha (grep + lectura directa contra el HEAD actual) y la usa como base.
- Reabrir los slices nuevos S2–S5 fuera de esta auditoría — ya fueron implementados y cerrados en esta sesión.
- Resolver `f00020`, `f00019`, `f00027`, `r00002` o `l00008` — se referencian como ya-cubiertos, no se reimplementan ni se tocan sus archivos.
- Resolver la duplicación documentada entre `r00002` y `l00008` (mismos dos archivos de catchall, `rules-tools.ts:199` y `adopt.tool.ts:81`) — se documenta como meta-hallazgo informativo (§ Findings, fila "META"), no se decide aquí cuál propuesta debe ceder el slice.
- Ejecutar el triage completo de `a00025` más allá de lo descrito en su propia sección — `a024a`/`a024b` quedan explícitamente diferidas (no creadas) con la razón documentada; solo `a024c` (sin prerequisite) se considera lista para crear en una sesión de implementación futura, no en esta consolidación.

## Slices

- global_gate: lint

### S1 — Execute audit and document findings (este documento)
- **Files**: `docs/proposals/done/audits/a00022-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md`
- **Gate**: `bun run lint:proposals`
- **Status**: done
- status: done

### S2 — Include `extensions/vscode` in root `vitest.config.ts` projects
- **Files**: `vitest.config.ts`
- **Gate**: `bun run validate`
- **Status**: done
- status: done

### S3 — Include `plugins/audit` in root `tsconfig.json` typecheck coverage
- **Files**: `tsconfig.json`
- **Gate**: `bun run validate`
- **Status**: done
- status: done
- **Verification**: `tsconfig.json` already includes `plugins/*/src/**/*` and `plugins/*/tests/**/*`, so `plugins/audit` is covered by the root `tsc --noEmit` gate.

### S4 — Expand `tools/scripts/smoke/pack.script.ts` to cover all publishable plugins (not just core+proposals+memory)
- **Files**: `tools/scripts/smoke/pack.script.ts`
- **Gate**: `bun run build && bun run smoke:pack`
- **Status**: done
- status: done
- **Verification**: `bun run build && bun run smoke:pack` passed; installed-from-tarball CLI served 76 tools under Node with 15 packed packages and 14 plugins resolved.

### S5 — Add try/catch + user-facing error feedback to 4 `extensions/vscode` MCP-client commands
- **Files**:
  - `extensions/vscode/src/commands/types.ts`
  - `extensions/vscode/src/commands/show-overview.ts`
  - `extensions/vscode/src/commands/show-metrics.ts`
  - `extensions/vscode/src/commands/open-proposal.ts`
  - `extensions/vscode/src/commands/run-validation.ts`
  - `extensions/vscode/src/test/commands.spec.ts`
- **Gate**: `bun run validate`
- **Status**: done
- status: done
- **Verification**: `bun run --cwd extensions/vscode test -- src/test/commands.spec.ts` passed with success-path coverage plus four MCP error feedback checks.

> **Slices deliberadamente NO abiertos aquí** (documentados solo como Finding sin slice, porque su severidad es baja y/o requieren una decisión de scope que no corresponde a esta consolidación): `apps/web/vitest.config.ts` sin cobertura de componentes Astro (H-WEB-TEST), `scripts/derive-version.ts` sin tests deterministas (H-DERIVE-VERSION), dedupe de i18n langs `apps/web`↔`extensions/vscode` vía `apps/shared/` (H-I18N-DUP). Ver § Findings para el detalle de cada uno y por qué quedan como nota, no como slice.

## Acceptance

- `bun run lint:proposals` es verde para este documento.
- `bun run validate` es verde tras implementar y cerrar S1–S5.
- Cada finding deduplicado de a00021/a00026/a00024/a00023 tiene un Resolution Track explícito: `Verified — resolved` (ya en disco), `Referenced — covered by Proposal <id>` (no se duplica slice), o `New slice <Sx>` (accionable, abierto aquí).
- `a00021`, `a00026`, `a00024`, `a00025`, `a00023` quedan transicionadas a `done/audits/` con nota de cierre "Superseded by a00022".
- `docs/proposals/index.json` refleja el estado final (a00022 y las 5 originales en `done/audits/`).

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| Auditorías de repositorio consolidadas | a00021, a00026, a00024, a00023 | 4, score 8.4–9.6/10, ninguna FATAL |
| Meta-estudio consolidado | a00025 | 1, tratado en sección separada |
| Findings deduplicados verificados "ya resueltos en código" | grep/lectura directa, hoy | 8 |
| Findings deduplicados referenciados a propuesta `ready/` existente | f00020, f00019, r00002, l00008 | 6 (con 1 meta-hallazgo de duplicación r00002↔l00008 documentado) |
| Findings deduplicados sin cobertura → slice nuevo | S2–S5 de este documento | 4 slices (cubriendo 7 hallazgos: vscode test coverage, audit typecheck, smoke-pack scope, vscode try/catch ×4) |
| `extensions/vscode` en `vitest.config.ts` raíz | `grep -n "apps/" vitest.config.ts` | ausente (solo `apps/web`, `packages/ui-extension`) — confirmado hoy |
| `apps/shared/` (dedupe i18n) | `ls apps/shared` | no existe — confirmado hoy |
| Conflicto de merge `apps/web/src/data/skills.json` (a00023 H10) | `git status --porcelain apps/web/src/data/skills.json` | limpio — confirmado hoy, ya no aplica |

## Findings

> Notación: cada fila cita el/los hallazgo(s) origen (`a02N-H#`) que se deduplican en esta fila.

### Verified — resolved (ya en disco, sin slice)

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| F1 | P1 | `data-pagefind-body` ausente en el layout Astro (a00021-H3, a00023-H4) | [Base.astro:113](file:///home/cartago/_projects/mcp-vertex/apps/web/src/layouts/Base.astro#L113) | **Verified — resolved.** Confirmado presente hoy; `a00023` reporta haberlo arreglado en su slice `S2`. |
| F2 | P0 | `IStatusBarItem.visible` ausente, rompía `tsc --noEmit` global (a00023-H1) | [host-adapter.types.ts](file:///home/cartago/_projects/mcp-vertex/packages/ui-extension/src/host-adapter.types.ts) | **Verified — resolved.** Propiedad presente hoy. |
| F3 | P0 | `DashboardService.getOverviewModel()` sin generics, rompía `bun run site:strict` (a00023-H2) | [dashboard-service.ts](file:///home/cartago/_projects/mcp-vertex/packages/client/src/lib/services/dashboard-service.ts) | **Verified — resolved.** Generics correctos hoy. |
| F4 | P0 | Re-exports rotos en `packages/client/src/public/index.ts` (a00023-H3) | [index.ts](file:///home/cartago/_projects/mcp-vertex/packages/client/src/public/index.ts) | **Verified — resolved.** Reexports correctos hoy. |
| F5 | P1 | `sync-proposal-registry.ts:564` usaba tab en vez de 4 espacios al regenerar `index.json`, dejando `bun run lint` rojo (a00023-H5) | [sync-proposal-registry.ts:569](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L569) | **Verified — resolved.** `JSON.stringify(index, null, 4)` confirmado hoy. |
| F6 | P3 | `plugins/audit` sin `LICENSE`, `package.json#files` no lo incluía (a00024-H6, a00023-H6) | [plugins/audit/LICENSE](file:///home/cartago/_projects/mcp-vertex/plugins/audit/LICENSE), [package.json](file:///home/cartago/_projects/mcp-vertex/plugins/audit/package.json) | **Verified — resolved.** `LICENSE` existe y está en `files` hoy. |
| F7 | P3 | `*.tsbuildinfo` ausente de `.gitignore` raíz (a00026-H6) | [.gitignore:14](file:///home/cartago/_projects/mcp-vertex/.gitignore#L14) | **Verified — resolved.** Confirmado en línea 14 hoy. |
| F8 | P0 | `bun run validate` rojo por lint en `Config.astro`/`PluginsSection.astro` (a00024-H1) | `apps/web/src/components/Config.astro`, `apps/web/src/components/PluginsSection.astro` | **Verified — resolved.** `bun run lint` hoy: 4 warnings/6 infos no bloqueantes (probablemente resuelto vía el commit x00007 "web UI bugfixes round 2", ya en `done/`). |
| F9 | P2 | `auto_work`/loop-detector soft-loop sin detección de estancamiento (a00021-H4, antes referido como `f120` hipotético) | [plugins/proposals/src/index.ts:108](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/index.ts#L108) | **Verified — resolved.** `a00023` confirma el wiring de `agent-loop-detector.ts` + `loop-detector-service.ts` en producción, disparado en vivo durante tests. |

### Referenced — covered by an existing `ready` proposal (sin slice nuevo aquí)

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| F10 | P0 | Race condition: `writeFile` sin `writeFileAtomic` antes del `rename` a `historical/` (a00026-H1, a00023-H7) | [sync-proposal-registry.ts:331](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L331) | **Referenced — covered by Proposal `f00020`** (status: ready), not duplicated here. Confirmado aún presente en código. |
| F11 | P0 | I/O síncrono (`existsSync`/`readdirSync`/`readFileSync`, 11 usos) en `notification/watcher.ts` dentro de `setInterval` (a00026-H2, a00023-H8) | [watcher.ts](file:///home/cartago/_projects/mcp-vertex/plugins/notification/src/lib/watcher.ts) | **Referenced — covered by Proposal `f00019`** (status: ready), not duplicated here. Confirmado 11 usos aún presentes. |
| F12 | P2 | I/O síncrono (3 usos `writeFileSync`/`readFileSync`) en `rules/frameworks/manifest.ts` (a00024-H4, a00023-H9) | [manifest.ts](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/lib/frameworks/manifest.ts) | **Referenced — covered by Proposal `l00008`** (slice `s2`, status: ready), not duplicated here. Confirmado 3 usos aún presentes. |
| F13 | P1 | Path containment ausente en `plugins/audit/src/lib/tools/consolidate-tool.ts` (origen de l00008) | [consolidate-tool.ts](file:///home/cartago/_projects/mcp-vertex/plugins/audit/src/lib/tools/consolidate-tool.ts) | **Referenced — covered by Proposal `l00008`** (slice `s3`, status: ready), not duplicated here. |
| F14 | P1 | 6 `outputSchema` `z.object({}).catchall(z.unknown())` residuales: 3× `bootstrap-tool.ts`, 1× `scaffold-tool.ts`, 1× `rules-tools.ts`, 1× `adopt.tool.ts` (a00026-H3, a00023-H9) | [bootstrap-tool.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/bootstrap/bootstrap-tool.ts), [scaffold-tool.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-tool.ts), [rules-tools.ts](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/lib/rules-tools.ts), [adopt.tool.ts](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/tools/proposals/adopt.tool.ts) | **Referenced — covered by Proposal `r00002`** (slices S1–S4, status: ready) **and also by `l00008`** (slice `s4`, for `rules-tools.ts` + `adopt.tool.ts` specifically — see META finding below). Confirmado 6 catchalls aún presentes. |
| F15 | P1 | JSDoc "boot-only" ausente en `writeFileAtomicSync`/`quarantineCorruptFileSync` (a00026-H4) | [atomic-write.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/atomic-write.ts), [quarantine-corrupt-file.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/quarantine-corrupt-file.ts) | **Referenced — covered by Proposal `r00002`** (slice S5, status: ready), not duplicated here. |

### META — meta-hallazgo informativo (sin slice, sin propuesta)

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| META-1 | info | **Duplicación real entre `r00002` y `l00008`**: ambas propuestas `ready/` reclaman el mismo fix para los mismos 2 archivos — `rules-tools.ts:199` (catchall en `get_rules.areas[].rules`) y `adopt.tool.ts:81` (catchall en `adopt.layout`). `r00002` los cubre en su slice "S4" (Frente 1, ítems #5 y #6 de su tabla); `l00008` los cubre en su slice `s4` ("Tipar catchalls residuales en rules/get_rules y proposals/adopt"). Si ambas propuestas se implementan sin coordinación, una de las dos hará trabajo redundante (o, peor, ambas tocan el mismo archivo en paralelo y colisionan). | [r00002](file:///home/cartago/_projects/mcp-vertex/docs/proposals/ready/r00002-harden-catchall-outputschemas-jsdoc-boot-only-en-primitivas-sync-del-core.md), [l00008](file:///home/cartago/_projects/mcp-vertex/docs/proposals/ready/l00008-plugins-project-state-sync-cerrar-el-drift-residual-loop-detector-rules-manifest-audit-consolidate-catchalls-brief-tool-outputs.md) | **Informational only — no slice here.** Es un follow-up de naturaleza distinta a esta auditoría (coordinación entre propuestas existentes, no un hallazgo de código). Se recomienda que quien tome `r00002` o `l00008` primero, recorte el alcance solapado de la otra propuesta antes de implementar — pero esa decisión no se toma en `a00022`. |

### New slice (sin cobertura previa — accionable en a00022)

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| F16 | P1/P3 | `extensions/vscode` sigue excluido de `vitest.config.ts` raíz — el slot liberado lo ocupó `packages/ui-extension`, no `extensions/vscode` (a00021-H1, a00024-H2, confirmado también por a00023 sin slice propio) | [vitest.config.ts](file:///home/cartago/_projects/mcp-vertex/vitest.config.ts) | **New slice `S2`** en este documento. |
| F17 | P1 | `plugins/audit` excluido del typecheck raíz (`tsconfig.json`) pero sí se construye/publica vía `scripts/build.ts` — gate principal no cubre toda la superficie publicada (a00024-H3) | [tsconfig.json](file:///home/cartago/_projects/mcp-vertex/tsconfig.json), [scripts/build.ts](file:///home/cartago/_projects/mcp-vertex/scripts/build.ts) | **New slice `S3`** en este documento. |
| F18 | P2 | `tools/scripts/smoke/pack.script.ts` solo cubría `['packages/core', 'plugins/proposals', 'plugins/memory']` — el resto de plugins publicables no tenía smoke de tarball (a00024-H5) | [pack.script.ts](file:///home/cartago/_projects/mcp-vertex/tools/scripts/smoke/pack.script.ts) | **New slice `S4`** en este documento. |
| F19 | P2 | 4 comandos de `extensions/vscode/src/commands/{show-overview,show-metrics,open-proposal,run-validation}.ts` invocan el cliente MCP sin try/catch ni feedback de error visible (a00024-H8) | `extensions/vscode/src/commands/show-overview.ts`, `show-metrics.ts`, `open-proposal.ts`, `run-validation.ts` | **New slice `S5`** en este documento. |

### Notas (sin slice, severidad baja o requiere decisión de scope ajena a esta consolidación)

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H-WEB-TEST | P3 | `apps/web/vitest.config.ts` solo testea `scripts/__tests__/**/*.spec.ts`, sin cobertura de componentes/páginas Astro (a00024-H7) | [apps/web/vitest.config.ts](file:///home/cartago/_projects/mcp-vertex/apps/web/vitest.config.ts) | **Not actioned.** Severidad P3, requiere decidir el framework de testing de componentes Astro (fuera del scope de esta consolidación); queda como nota para una propuesta dedicada futura si se decide perseguir. |
| H-DERIVE-VERSION | P3 | `scripts/derive-version.ts` (decide el semver de cada release) sin tests deterministas (a00026-H8) | [scripts/derive-version.ts](file:///home/cartago/_projects/mcp-vertex/scripts/derive-version.ts) | **Not actioned.** Pieza única y de bajo riesgo de cambio; se documenta como deuda conocida, no se abre slice en esta consolidación. |
| H-I18N-DUP | P2 | 12 idiomas duplicados entre `apps/web/src/i18n/langs/` y `extensions/vscode/src/i18n/langs/` sin módulo compartido — `apps/shared/` no existe (a00026-H5/S2, nunca se ejecutó pese a estar en el slice S2 de la propia a00026) | `apps/web/src/i18n/langs/`, `extensions/vscode/src/i18n/langs/` | **Not actioned.** Confirmado que `apps/shared/` no existe hoy. Es trabajo real y bien delimitado, pero su slice natural pertenece a quien posea el roadmap de i18n de las dos apps a la vez; se deja documentado en vez de crear un slice nuevo que compita con el ya descrito (y abandonado) en `a00026-S2`. |
| H-MERGE-CONFLICT | info | Conflicto de merge `apps/web/src/data/skills.json` ("deleted by us") mencionado por a00023-H10 como evidencia operativa puntual | `apps/web/src/data/skills.json` | **Not actioned — confirmed stale.** `git status --porcelain` sobre ese archivo está limpio hoy; era una nota histórica del working tree concurrente durante la sesión de a00023, ya no aplica. |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura núcleo-plugin | 9.4 | Consenso de los 4 revisores de repositorio: agnóstico, contratos estrechos, sin acoplamiento de dominio. |
| Concurrencia / I/O durable | 8.8 | Primitivas (`withFileMutex`, `writeFileAtomic`, `quarantineCorruptFile`) consistentes; deuda puntual ya rastreada (`f00020`/`f00019`/`l00008`). |
| Cobertura de gate (`validate`) | 8.0 | `extensions/vscode` y `plugins/audit` fuera del root gate (F16/F17, slices nuevos); resto del gate sano. |
| Empaquetado / release | 8.3 | Build + smoke existen; smoke de tarball estrecho (F18); release.yml saneado. |
| Plugins satélite | 8.6 | Sanos en general; I/O síncrono puntual ya cubierto por propuestas existentes; catchalls residuales con duplicación de propuestas documentada (META-1). |
| Apps (web + vscode + ide) | 8.5 | i18n 12/12 completo; vscode con gap de try/catch (F19) y de cobertura de test global (F16). |
| **Total (Average)** | **8.6** | **Consolidación de 4 auditorías de repositorio (8.4–9.6) sin FATAL; deuda real es de acabados de plataforma, no de diseño.** |

## Notes

### Estudio de eficiencia de tokens (a00025, sección separada)

`a00025` no es un hallazgo de calidad de código — es un **meta-estudio** sobre el ahorro de tokens que propone su propio plan de derivación (`a024a`/`a024b`/`a024c`/`a024d`). Se incluye aquí como sección separada (no como exclusión silenciosa) porque el pedido del usuario fue unificar **todas** las auditorías `ready`, y `a00025` cumple esa condición aunque su naturaleza sea distinta.

### Resumen del estudio (de `a00025`)

`a00025` identificó 4 familias de mecanismo de ahorro de tokens:

- **Familia A** (cache de respuestas MCP por slice) — H2, evidencia anecdótica de una sesión (43%/39% de bytes en `proposals_get_proposal_workflow`).
- **Familia B** (snapshot plugin de working tree) — H4, indeterminada, condicional a que la medición de D confirme que `git diff` entra al top 3 de bytes.
- **Familia C** (disciplina operativa, ya parcialmente en `AGENTS.md`) — H3, falta solo formalizarla como skill.
- **Familia D** (medición longitudinal, el prerequisite de A y B) — H1, **ya cubierta por `f00027`** (`status: ready`), no duplicada por `a00025`.

### Decisión sobre `a024a`/`a024b`/`a024c`/`a024d`

Verificado: **ninguna de las cuatro existe** en `docs/proposals/ready/` al momento de esta consolidación (`ls docs/proposals/ready/ | grep a00025` solo devuelve `a00025` mismo).

Siguiendo el criterio (b) ofrecido para este encargo — dado que mezclar el triage completo de un meta-estudio con una consolidación de auditorías de código es una tarea de naturaleza distinta, y que crear 3-4 proposals nuevas con sus propios slices/aceptación excede el alcance de "dejar la auditoría unificada bien formada" — esta sección **documenta la decisión explícitamente en vez de ejecutarla silenciosamente**:

- **`a024a` (cache de respuestas MCP)** — **diferida explícitamente**, prerequisite no cumplido (`f00027` aún `status: ready`, no `done`). No se crea en esta sesión.
- **`a024b` (snapshot plugin)** — **diferida explícitamente**, doble prerequisite no cumplido (`f00027` merged AND medición que confirme `git diff` en el top 3 de bytes). No se crea en esta sesión.
- **`a024c` (skill `token-hygiene`)** — **sin prerequisite**, es la única candidata lista para crearse de inmediato. **No se crea en esta sesión** (fuera del alcance de "no implementar los slices nuevos" del encargo de a00022), pero queda **recomendada como acción de seguimiento de baja friction** para la próxima sesión de implementación: `skills/token-hygiene/SKILL.md` con el contenido de `AGENTS.md` § "Re-read discipline" + catálogo de tools compactas.
- **`a024d`** — no es una propuesta independiente real (el propio `a00025` la describe como "copy en `TOKEN-BUDGETS.md` referenciando `f00027`", sin prerequisite propio); se trata como nota de documentación pendiente, no como propuesta a crear.

**a00025 permanece sin su propio `done` aquí** — su S2 (triage) describe crear los derivados en `ready/`; como esta consolidación decide explícitamente NO crearlos todavía (ver arriba), `a00025` se cierra junto con las otras 4 con la misma nota de "superseded by a00022", y la decisión de triage queda registrada en esta sección como el resultado de su S2 (en vez de proposals nuevas, una decisión explícita y trazable). Si una sesión futura quiere ejecutar `a024c`, puede hacerlo directamente sin depender de que `a00025` siga abierta — el contenido de su scope ya está documentado tanto en el propio `a00025` (preservado en `done/audits/`) como en esta sección.

### Notas generales de la consolidación

- Esta consolidación parte de una investigación de cross-referencing ya realizada (grep + lectura directa contra el HEAD actual) antes de escribir este documento — no repite la lectura exhaustiva de código que ya hicieron `a00021`/`a00026`/`a00024`/`a00023`.
- Las 5 auditorías originales se cierran (`status: done`, movidas a `docs/proposals/done/audits/`) con la nota: "Superseded by unified audit `a00022` (consolidación de auditorías ready del 2026-06-21); ver a00022 para hallazgos referenciados y slices vivos."
- Los slices nuevos de esta auditoría (S2–S5) se implementaron y cerraron en esta sesión; `bun run validate` quedó verde.
- El meta-hallazgo META-1 (duplicación `r00002`↔`l00008`) y la nota H-I18N-DUP quedan deliberadamente sin propuesta de seguimiento — son follow-ups de coordinación entre propuestas existentes, no hallazgos nuevos de código, y exceden el mandato de esta consolidación.
