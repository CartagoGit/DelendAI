---
id: q00003
status: done
type: plan
track: develop-audit-consolidation
date: 2026-08-24
kind: plan
title: Consolidación post-auditoría de develop — privacidad, lifecycle, tokens, registry y arquitectura
related:
    - f00158 # auto error-reporting + issues-triage — implementación actual que el track privacy endurece
    - r00015 # creación de plugins: una sola fuente de verdad — precedente del track registry
contains:
    proposals:
        - { id: x00214, kind: fix, required: true }
        - { id: x00215, kind: fix, required: true }
        - { id: f00159, kind: feat, required: true }
        - { id: t00005, kind: test, required: true }
        - { id: x00216, kind: fix, required: true }
        - { id: f00160, kind: feat, required: true }
        - { id: x00217, kind: fix, required: true }
        - { id: x00218, kind: fix, required: true }
        - { id: f00161, kind: feat, required: true }
        - { id: x00219, kind: fix, required: true }
        - { id: x00220, kind: fix, required: true }
        - { id: x00222, kind: fix, required: true }
        - { id: x00221, kind: fix, required: true }
        - { id: x00223, kind: fix, required: true }
        - { id: x00224, kind: fix, required: true }
        - { id: v00123, kind: perf, required: true }
        - { id: f00162, kind: feat, required: true }
        - { id: f00163, kind: feat, required: true }
        - { id: r00016, kind: refactor, required: true }
        - { id: x00225, kind: fix, required: true }
        - { id: x00226, kind: fix, required: true }
        - { id: r00017, kind: refactor, required: true }
        - { id: x00227, kind: fix, required: true }
        - { id: x00228, kind: fix, required: true }
        - { id: c00128, kind: chore, required: true }
        - { id: v00124, kind: perf, required: true }
        - { id: x00229, kind: fix, required: true }
        - { id: i00002, kind: infra, required: true }
        - { id: t00006, kind: test, required: true }
        - { id: d00005, kind: docs, required: true }
        - { id: f00164, kind: feat, required: true }
        - { id: f00165, kind: feat, required: true }
        - { id: f00169, kind: feat, required: true }
        - { id: f00166, kind: feat, required: true }
        - { id: f00167, kind: feat, required: true }
        - { id: f00168, kind: feat, required: true }
        - { id: a00086, kind: audit, required: true }
        - { id: a00087, kind: audit, required: true }
        - { id: a00088, kind: audit, required: true }
        - { id: i00003, kind: infra, required: true }
        - { id: c00129, kind: chore, required: true }
        - { id: f00173, kind: feat, required: true }
        - { id: x00230, kind: fix, required: true }
closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
globalGate: type
---

# q00003 — Consolidación post-auditoría de develop: privacidad, lifecycle, tokens y arquitectura

## Goal

Orquestar la conversión de la **auditoría externa legada** en trabajo trazable, verificable y cerrable. Este plan agrupa **43 propuestas hijas** que cubren, punto por punto, las secciones 1–36 de la auditoría, y define las reglas de proyecto que deben respetar todas ellas.

Fuente de la auditoría (material de entrada, conservado como referencia legada):

- `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`

El plan no produce código por sí mismo: es un **orquestador**. El trabajo real lo entregan las propuestas hijas, y el plan no puede cerrarse (`done`) hasta que todas estén cerradas y peer-reviewadas.

## why

La auditoría externa detectó que la ambición del proyecto ha avanzado más rápido que su consolidación: hay fuentes de verdad duplicadas, la superficie MCP ha crecido mucho, la documentación no acompaña al código y existen bugs de infraestructura importantes. El hallazgo más grave es de **privacidad** (`error-reporting`). La prioridad es cerrar, con evidencia, cada una de esas observaciones — sin "arreglar" falsos positivos y sin convertir budgets en registros históricos de crecimiento.

## non-goals

- Un plan no produce commits propios (los commits los producen las propuestas hijas).
- No añadir nuevos plugins de forma indiscriminada: primero consolidar lo existente.
- No interpretar la auditoría como una lista de bugs 100% confirmados; cada hallazgo se reproduce antes de fijar.
- No subir presupuestos de tokens automáticamente para hacer pasar tests.
- No es asesoramiento legal; la revisión jurídica del reporting se documenta, no se sustituye.

### N. Reglas de proyecto (dogma — aplican a TODAS las propuestas hijas)

1. **Privacidad por construcción (invariante supremo).** Ningún dato del usuario, de su empresa, de su máquina, de sus rutas, repos, ramas, secretos, prompts, documentos o terceros puede recopilarse, transmitirse ni publicarse. El reporting se construye **exclusivamente** con datos internos de MCP Vertex y ejemplos sintéticos. Ante cualquier duda: **no se envía** (fail-closed). Esto está grabado en la auditoría §1.1, §30 y §41.
2. **Clean code y SOLID.** Nuevo código sigue los principios SOLID; los contratos viven en `contracts/` (`*.interface.ts`, `*.constant.ts`); los servicios usan sufijos de rol (`*.service.ts`, `*.helper.ts`, `*.tool.ts`, `*.builder.ts`); DIP: fs y dependencias inyectables.
3. **Reutilizar, no duplicar.** Si un dato puede generarse, no se mantiene a mano en cinco sitios. Se reutiliza la infraestructura existente (`withFileMutex`, `writeFileAtomic`, `toolOk/toolError/toolJson`, `redactSecrets`, `assembleCliConfig`).
4. **Documentación siempre actualizada.** Toda propuesta que cambie comportamiento observable actualiza README/knowledge/tests en la misma entrega. Se distingue documentación humana (visión/rationale) de datos generados.
5. **Arquitectura de carpetas y naming.** Se respeta el layout del monorepo (`packages/`, `plugins/`, `apps/`, `extensions/`, `tools/`) y las convenciones de naming (kebab-case de archivos, sufijos de rol, barrels `index.ts`/`public/index.ts`).
6. **Mantenibilidad.** El código prioriza `por qué / invariante / riesgo` sobre historial cronológico; el historial se mueve a ADR/proposal.
7. **Budgets son restricciones.** Un budget de tokens no es un número que se sube hasta que el test pasa; toda subida se justifica y documenta.
8. **Verificación sobre suposición.** Cada observación se reproduce con test que falla antes del fix, y se marca `confirmed / not reproducible / already fixed / accepted risk / implemented`.

### N. Auditoría legada: cómo se relacionan las propuestas

Cada propuesta hija cita, en su `## Goal`, la sección exacta de la auditoría que cubre. El mapeo de referencia es el siguiente (la columna `Legacy` es la sección de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

### Track `privacy` (P0 — lo primero, sin excepción)

| Propuesta | Legacy                                    | Resumen                                                                                                  |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `x00214`  | §2 ER-001/003/004/006, §32, §35           | Pipeline DTO-only: prohibir `Error/stack/args/message` crudos                                            |
| `x00215`  | §2 ER-002, §33                            | Clasificación interna por evidencia positiva + fingerprint sin datos de usuario                          |
| `f00159`  | §2 ER-005, §31                            | Ejemplos sintéticos generados desde schema/fixtures                                                      |
| `t00005`  | §2 ER-007                                 | Suite adversarial (payload invariante ante datos privados)                                               |
| `x00216`  | §2 ER-008, §34, §36 ER-NET-004            | `lastSuccessAt`, rate limits, circuit breaker                                                            |
| `f00160`  | §2 ER-009, §36 ER-NET-001..003, §1.1, §30 | `report_status`, opt-out, destino allowlisted, docs legales                                              |
| `f00173`  | §24 error-reporting, §30, §35             | Observar todas las superficies de error (tools, lifecycle, LLM/providers, procesos) + análisis de origen |

> `error-reporting` se implementa en `f00158` (existente); este track **endurece** ese flujo al modelo DTO-only. Las seis propuestas del track son secuenciales en espíritu (x00214 → x00215 → f00159 → t00005 → x00216 → f00160) aunque pueden arrancar en paralelo si el agente fija primero el contrato DTO de `x00214`.
>
> **Taxonomía canónica de issues** (asignada al crear la issue, compartida entre `error-reporting` y el triage `issues-triage` de `f00158`): `BUG`, `REGRESSION`, `SECURITY`, `PRIVACY`, `PERFORMANCE`, `TOKEN_REGRESSION`, `DOC_DRIFT`, `CONFIG_DRIFT`, `DUPLICATE`, `NOT_A_BUG`, `DESIGN_DECISION`, `PRODUCT_DECISION`, `NEEDS_REPRODUCTION`, `UNKNOWN`. Las clases de decisión (`DESIGN_DECISION`, `PRODUCT_DECISION`, `NEEDS_REPRODUCTION`, `UNKNOWN`) piden decisión humana en lugar de propuesta automática.

### Track `lifecycle`

| Propuesta | Legacy            | Resumen                                          |
| --------- | ----------------- | ------------------------------------------------ |
| `x00217`  | §3 PL-001/002     | `parsed.data` + frontera única de validación     |
| `x00218`  | §3 PL-003/004     | Grafo de dependencias con estados + ciclos       |
| `f00161`  | §3 PL-005/006/007 | Cancelación (`AbortSignal`), `dispose`, rollback |

> Orden recomendado: `x00217` → `x00218` → `f00161` (todas tocan `load-plugins.ts`).

### Track `concurrency`

| Propuesta | Legacy            | Resumen                                                  |
| --------- | ----------------- | -------------------------------------------------------- |
| `x00219`  | §5 MX-001/002     | Reclaim seguro de stale lock + métricas de contención    |
| `x00220`  | §6 PR-001/002/003 | `maxOutputBytes` real (buffers) + política stdout/stderr |
| `x00222`  | §6 PR-004/005     | Matar árbol de procesos en `runArgv`                     |
| `x00221`  | §4 FS-001/002     | TOCTOU + threat model + tests Windows                    |

### Track `metrics`

| Propuesta | Legacy          | Resumen                                               |
| --------- | --------------- | ----------------------------------------------------- |
| `x00223`  | §7 MET-001..005 | Bytes UTF-8, contar errores, tipos de coste           |
| `x00224`  | §8 OUT-001..005 | Contrato de truncación honesto + paginación universal |

### Track `tokens`

| Propuesta | Legacy                       | Resumen                                                                  |
| --------- | ---------------------------- | ------------------------------------------------------------------------ |
| `v00123`  | §9 TOK-001..004, §20 DOC-002 | Dashboard `tools/list` + budgets absolutos + `TOKEN-BUDGETS.md` generado |
| `f00162`  | §9 TOK-005/011, §29          | Token tax + utility per 1K + KPIs                                        |
| `f00163`  | §9 TOK-006..010/012          | Activación dinámica + superficie compacta + descripciones en dos niveles |

### Track `registry`

| Propuesta | Legacy                             | Resumen                                                   |
| --------- | ---------------------------------- | --------------------------------------------------------- |
| `r00016`  | §10 REG-002..004, §21 MAN-001..010 | Manifests como única fuente de verdad + generadores       |
| `x00225`  | §10 REG-001, §11 PRE-003           | `auto-plugin-selector` en el índice + drift `backend-api` |
| `x00226`  | §11 PRE-001/002/004/005            | Presets por lint, redefinir `standard`, budget por preset |

### Track `core`

| Propuesta | Legacy                          | Resumen                                                              |
| --------- | ------------------------------- | -------------------------------------------------------------------- |
| `r00017`  | §12 CORE-001..004               | Separar runtime/plugin-sdk/authoring/setup/analyzer                  |
| `x00227`  | §13 CFG-001..003                | Defaults project-agnostic + project analyzer                         |
| `x00228`  | §16 CLIEN-001..003, §26 REL-004 | Client: versión inyectada, payload validation, errores de transporte |
| `c00128`  | §17 VER-001/002                 | Política de versiones + lint `dependency-versions`                   |

### Track `memory-mcp`

| Propuesta | Legacy           | Resumen                                         |
| --------- | ---------------- | ----------------------------------------------- |
| `v00124`  | §14 MEM-001..004 | Freshness event-driven + debounce + hit-rate    |
| `x00229`  | §15 MCP-001..003 | Metadata vs `outputSchema` + envolvente `_meta` |

### Track `ci-test-docs`

| Propuesta | Legacy                            | Resumen                                                      |
| --------- | --------------------------------- | ------------------------------------------------------------ |
| `i00002`  | §18 CI-001..008                   | Gates arquitectónicos obligatorios + DAG + branch protection |
| `t00006`  | §19 TEST-001..004                 | Coverage: `index.ts` selectivo, apps/web, property-based     |
| `d00005`  | §20 DOC-001..005, §27 SRC-001/002 | Docs generadas + separación humano/generado                  |

### Track `permissions`

| Propuesta | Legacy            | Resumen                                                     |
| --------- | ----------------- | ----------------------------------------------------------- |
| `f00164`  | §22 PERM-001..004 | Modelo de permisos por plugin/tool + penalización de riesgo |

### Track `product`

| Propuesta | Legacy                   | Resumen                                                                   |
| --------- | ------------------------ | ------------------------------------------------------------------------- |
| `f00165`  | §23 IDEA-001             | `context_for_change`                                                      |
| `f00169`  | §23 IDEA-002/003         | `impact_analyze` + `tests_for_change`                                     |
| `f00166`  | §23 IDEA-004             | `project_health` (resumen lazy)                                           |
| `f00167`  | §23 IDEA-005             | `quality_policy` unificado                                                |
| `f00168`  | §23 IDEA-006, §9 TOK-012 | Optimizador adaptativo                                                    |
| `x00230`  | §24 auto-agent-selector  | Cablear la ejecución end-to-end de la selección automática de LLM/agentes |

### Track `plugin-hardening`

| Propuesta | Legacy   | Resumen                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------- |
| `a00086`  | §24, §30 | Barrido seguridad/privacidad (browser, container, forge, database, api, external-mcps, ...) |
| `a00087`  | §24      | Barrido tokens/output (audit, prompt-eval, diagram, docs, search, memory, ...)              |
| `a00088`  | §24      | Barrido correctitud/solapamiento (proposals, quality, refactor, test-policy, ...)           |

### Track `web-release`

| Propuesta | Legacy           | Resumen                                                |
| --------- | ---------------- | ------------------------------------------------------ |
| `i00003`  | §25 WEB-001..003 | Web: perfiles token/permisos + cobertura UI            |
| `c00129`  | §26 REL-001..003 | Release: Node smoke, tarball e2e, manifest correctness |

### Cobertura de secciones transversales

- **§28 CHECK-001..008** (validaciones previas) quedan incrustadas como primer paso de la propuesta correspondiente (CHECK-001→`x00229`, CHECK-002→`x00222`, CHECK-003→`x00219`, CHECK-004→`f00163`, CHECK-005→`r00017`, CHECK-006→`x00224`, CHECK-007→`v00123`, CHECK-008→`f00162`).
- **§37–44** (prioridades, plantilla, criterios globales, principios, producto y checklist) son el marco de este plan: las prioridades P0–P3 se reflejan en el orden de tracks, y los criterios de aceptación globales (§40) se recogen abajo.

### N. Prioridades (de la auditoría §37)

- **P0**: track `privacy` completo + `x00218`/`f00161` (lifecycle) + `x00219` (mutex) + `x00223` (métricas).
- **P1**: `r00016`/`x00225`/`x00226` (registry) + `v00123` (budgets) + `i00002` (CI) + `x00224` (paginación) + `x00220`/`x00222` (procesos) + `c00128` (versiones) + `t00006` (coverage).
- **P2**: `v00123`/`f00162`/`f00163` (tokens) + `x00226` (task-aware presets).
- **P3**: track `product` completo + `f00164` (permisos).

## Slices

- global_gate: type

### S1 — Orquestar las 43 propuestas hijas a `done`

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/plans/q00003-consolidacion-post-auditoria-de-develop-privacidad-lifecycle-tokens-y-arquitectura.md`
- **Gate**: type
- acceptance:
  - "Cada propuesta hija cierra sus slices y pasa peer review (requireAllChildrenDone + requireAllSlicesDone)."
  - "Esta tabla de tracks se actualiza con el estado real de cada hija al avanzar (el plan es el orquestador)."
  - "El cierre usa proposals_close_plan, que devuelve blockers si queda alguna hija abierta."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — APPROVE. Direct checks confirm S1 is done, contains declares and table lists the same 43 children with no missing, extra, or duplicate IDs; commit 8724ee03 exists; proposal lint passes with 0 fatal errors; q00003 has one physical file.
### Estado operativo de las hijas — 2026-08-29

| Estado | Propuestas                                                                                                                                                                                                                                                                                                                                                                                                                                   | Evidencia MCP                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `done` | `x00214`, `x00215`, `f00159`, `t00005`, `x00216`, `f00160`, `x00217`, `x00218`, `f00161`, `x00219`, `x00220`, `x00222`, `x00221`, `x00223`, `x00224`, `v00123`, `f00162`, `f00163`, `r00016`, `x00225`, `x00226`, `r00017`, `x00227`, `x00228`, `c00128`, `v00124`, `x00229`, `i00002`, `t00006`, `d00005`, `f00164`, `f00165`, `f00169`, `f00166`, `f00167`, `f00168`, `x00230`, `f00173`, `i00003`, `c00129`, `a00086`, `a00087`, `a00088` | `proposal_board`: las 43 propuestas tienen todos sus slices cerrados, peer review aprobado y archivos bajo `proposals/done/` |

Resultado de S1: `proposal_board` confirma que las 43 propuestas hijas tienen todos sus slices cerrados, peer review aprobado y estado global `done`; por tanto, el plan queda listo para su cierre mediante `proposals_close_plan`.

## acceptance

Criterios de aceptación globales (de la auditoría §40), verificados a través de las hijas:

- Cada TODO de la auditoría tiene una resolución explícita (reproduced+fixed / already fixed / not reproducible / intentional / accepted risk / superseded).
- Los falsos positivos están marcados con evidencia; los bugs confirmados tienen regression test.
- `error-reporting` no puede publicar datos del proyecto; los reportes usan solo un DTO seguro; los ejemplos públicos son sintéticos; existe suite adversarial de privacidad.
- Plugin options normalizadas llegan a `register`; dependencias fallidas bloquean dependientes; timeouts de plugin cancelan/limpian; mutex stale reclaim protegido.
- Todas las métricas llamadas "bytes" son UTF-8 reales; las respuestas de error cuentan; los caps de proceso son reales.
- `tools/list` tiene budget visible por preset/plugin; `TOKEN-BUDGETS.md` se genera; registry/presets/docs no dependen de sincronización manual.
- CI obliga los gates arquitectónicos; la cobertura no excluye wiring real sin motivo.
- Existe política de permisos y de versiones; los datos de usuario/proyecto quedan fuera de cualquier reporting externo automático.
- `bun run validate` sigue verde al final de cada entrega.

### N. Orden de ejecución recomendado (para el agente orquestador)

1. `x00214` → `x00215` → `f00159` → `t00005` → `x00216` → `f00160` (privacidad, P0).
2. `x00217` → `x00218` → `f00161` (lifecycle).
3. `x00219`, `x00220`, `x00222`, `x00221` (concurrencia) y `x00223` (métricas) en paralelo.
4. `r00016` → `x00225` → `x00226` (registry, ordenado).
5. Resto por tracks, respetando que `f00163` (activación dinámica) se beneficia de `f00161` (dispose) y de `f00164` (permisos).
