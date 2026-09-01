---
id: q00004
title: "Plan hardening post-auditoría externa ChatGPT 5.6 Sol (segunda pasada sobre develop) — privacidad P0, filesystem, mutex, tokens, manifests y gobernanza"
kind: plan
status: done
type: plan
track: develop-audit-hardening-v2
date: 2026-08-25
date_iso: 2026-08-25
completion_date: 2026-08-25
predecessor-plan: q00003 # auditoría externa 2026-08-24 (43 hijas, in-progress)
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
    lines: 3003
    size: 54k
    reviewer: ChatGPT-5.6-Sol (external, high reasoning)
    commit-audited: e1b4cefd39c140913800748fea44c392026ca303
related:
    - q00003 # predecesor, sigue en progreso
    - f00158 # error-reporting (auto + issues-triage) — base de los hallazgos ER2-001/002/003
    - f00165 # context-for-change — plugin afectado por FS2-001
    - f00169 # impact-analysis + tests-for-change — afectados por FS2-002
    - x00214 # error-reporting: DTO seguro (privacy predecessor en q00003)
contains:
    proposals:
        # ─── Track A — Filesystem security (P1) ─────────────────────────────────────
        - { id: x00241, kind: fix, required: true, priority: P1, track: filesystem }
        - { id: x00242, kind: fix, required: true, priority: P1, track: filesystem }
        - { id: x00243, kind: fix, required: true, priority: P1, track: filesystem }
        - { id: c00004, kind: chore, required: true, priority: P2, track: filesystem }

        # ─── Track B — Concurrency (P1) ─────────────────────────────────────────────
        - { id: t00028, kind: test, required: true, priority: P1, track: concurrency }
        - { id: x00244, kind: fix, required: true, priority: P1, track: concurrency }
        - { id: t00008, kind: test, required: true, priority: P1, track: concurrency }

        # ─── Track C — Tokens (P1/P2) ───────────────────────────────────────────────
        - { id: c00005, kind: chore, required: true, priority: P1, track: tokens }
        - { id: c00006, kind: chore, required: true, priority: P2, track: tokens }
        - { id: r00018, kind: refactor, required: true, priority: P2, track: tokens }
        - { id: r00019, kind: refactor, required: true, priority: P2, track: tokens }
        - { id: c00007, kind: chore, required: true, priority: P2, track: tokens }

        # ─── Track D — PRIVACY (P0 — LEY/LEGAL — máximo énfasis) ────────────────────
        - { id: x00245, kind: fix, required: true, priority: P0, track: privacy }
        - { id: b00236, kind: breaking, required: true, priority: P0, track: privacy }
        - { id: x00237, kind: fix, required: true, priority: P0, track: privacy }
        - { id: t00009, kind: test, required: true, priority: P0, track: privacy }

        # ─── Track E — Manifests (P2) ───────────────────────────────────────────────
        - { id: f00174, kind: feat, required: true, priority: P2, track: manifests }
        - { id: f00175, kind: feat, required: true, priority: P2, track: manifests }
        - { id: c00008, kind: chore, required: true, priority: P2, track: manifests }
        - { id: c00009, kind: chore, required: true, priority: P2, track: manifests }

        # ─── Track F — Quality (P2/P3) ──────────────────────────────────────────────
        - { id: x00238, kind: fix, required: true, priority: P3, track: quality }
        - { id: x00239, kind: fix, required: true, priority: P3, track: quality }
        - { id: x00240, kind: fix, required: true, priority: P3, track: quality }
        - { id: r00020, kind: refactor, required: true, priority: P2, track: quality }

        # ─── Track G — CI / gobernanza (P2) ─────────────────────────────────────────
        - { id: c00010, kind: chore, required: true, priority: P2, track: ci }
        - { id: c00011, kind: chore, required: true, priority: P2, track: ci }

        # ─── Track H — Surface runtime (P2) ─────────────────────────────────────────
        - { id: r00021, kind: refactor, required: true, priority: P2, track: surface }
        - { id: f00176, kind: feat, required: true, priority: P2, track: surface }
closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
    requireEvidenceOnClose: true
globalGate: type
project-rules:
    privacy-inviolable: true
    privacy-by-construction: true
    fail-closed-on-uncertainty: true
    synthetic-examples-only: true
    one-source-of-truth: true
    budgets-are-constraints: true
    load-only-required-capabilities: true
    measure-real-runtime-surfaces: true
    invariants-as-apis-or-lints: true
    proposal-needs-evidence: true
    solid-mandatory: true
    clean-code-mandatory: true
    reusable-code-mandatory: true
    documentation-updated-on-change: true
    folder-and-naming-architecture-stable: true
---

# q00004 — Plan hardening post-auditoría externa ChatGPT 5.6 Sol (segunda pasada)

## Goal

Orquestar la conversión de la **segunda auditoría externa** (`docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md`, sha256 `fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d`) en trabajo trazable, verificable y cerrable. Este plan agrupa **28 propuestas hijas** distribuidas en **8 tracks** (A filesystem, B concurrency, C tokens, D privacy, E manifests, F quality, G CI/gobernanza, H surface runtime) y define las reglas de proyecto que todas las hijas deben respetar obligatoriamente.

**Predecesor**: `q00003` (auditoría 2026-08-24, 43 hijas, sigue en progreso). El presente plan NO duplica trabajo previo: las hijas de q00003 que sigan abiertas continúan ahí; este plan cubre hallazgos de la segunda pasada que o son nuevos, o son profundizaciones del mismo dominio.

### Fuente de la auditoría (entrada, conservada como referencia legada)

- `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md` — 3003 líneas / 54 KB / 48 secciones
- SHA-256: `fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d`
- HEAD auditado: `e1b4cefd39c140913800748fea44c392026ca303`
- Revisor: ChatGPT 5.6 (Sol mode, high reasoning) — auditoría externa legada, conservada como input

### Naturaleza de este plan

**El plan no produce código por sí mismo**: es un **orquestador**. El trabajo real lo entregan las 28 hijas, y el plan no puede cerrarse (`done`) hasta que:

1. Cada hija cierre sus slices y pase peer review (`requireAllChildrenDone + requireAllSlicesDone`).
2. La tabla de tracks/propuestas al final de este documento refleje el estado real.
3. `proposals_close_plan` no devuelva blockers.
4. Los criterios de aceptación globales (sección N) estén todos verificados con evidencia.

## why

La auditoría externa detectó que **la velocidad de creación de features ha superado a la de consolidación de invariantes**. Los nuevos plugins de alto valor (`context-for-change`, `impact-analysis`, `tests-for-change`, `project-health`, `quality-policy`, `adaptive-optimizer`) son excelentes como producto, pero han re-introducido clases de bugs que el core ya tenía resueltas (notablemente el **containment de filesystem** y la **provenance de tool id en error reporting**). El hallazgo de mayor severidad legal/regulatoria es que `error-reporting` puede seguir emitiendo nombres de tools registradas por el host/proyecto en issues públicos.

La prioridad es:

1. **Cerrar la frontera de privacidad por construcción** (Track D — P0).
2. **Imposibilitar el escape de filesystem por rutas absolutas/symlinks** (Track A — P1).
3. **Eliminar la posibilidad conceptual de race en stale reclaim del mutex** (Track B — P1).
4. **Convertir el real token budget en un gate CI real** (Track C — P1/P2).
5. **Terminar la migración de manifests** (Track E — P2).
6. **Endurecer CI/gobernanza** (Track G — P2).

Sin añadir features nuevas.

## non-goals

- **No desactivar `error-reporting` por defecto.** La decisión de producto es default-on. La privacidad se garantiza por arquitectura, no por opt-out.
- **No recopilar telemetría del proyecto, del usuario, de su empresa, de sus rutas, de sus archivos, de sus secretos ni de terceros.**
- **No subir automáticamente presupuestos de tokens** (TOK2-001: el swarm real está 19.7% por encima del hard budget; resolver reduciendo coste, no elevando el techo).
- **No crear más plugins primero** (la auditoría §43: "Hay suficiente catálogo para demostrar extensibilidad").
- **No dividir `packages/core` en runtime/sdk/authoring** todavía por estética (CORE2-001).
- **No convertir `adaptive-optimizer` en un experimento closed-loop** sin offline eval + rollback + privacy review (OPT2-003).
- **No añadir un mega-tool con `action: string` libre** para reducir el coste de proposals (TOK2-005: la solución debe mantener tipos estrictos).

---

# Reglas de proyecto obligatorias para todas las hijas

Estas reglas son **invariantes de producto** y deben respetarse en cada propuesta hija. Si una hija las viola, debe declarar la excepción explícitamente en `non-goals` y justificar el motivo. Las reglas ya son parte de `docs/mcp-vertex/AGENT-BOOTSTRAP.md §6`; este plan las re-enfatiza porque las hijas nuevas tienen alta densidad de cambios cross-cutting.

### N. R1 — Privacidad por construcción (P0 / LEGAL)

Esta es la regla más importante del proyecto, sin excepciones.

- **R1.1 — Nunca** publicar nombres de tools registradas por el host, paths, repo, branch, args, outputs, source code, URLs privadas, tokens, emails, nombres internos de archivos sensibles, ni nombres de tools externas que puedan revelar dominio de negocio (clases C y D de la auditoría §30).
- **R1.2 — Privacidad por construcción**, no por redacción. La frontera está en los tipos (`SafeScalar`, `ISafeToolIdentity`, etc.) y en el flujo del reporter, no en `redactSecrets()` aplicado al final.
- **R1.3 — Fail-closed ante la duda.** Si el validator duda → `NO SE ENVÍA`. Se registra localmente `report blocked by privacy validator: <reason code>`.
- **R1.4 — Synthetic examples only.** No "redactar datos reales" para hacer ejemplos. Construir desde cero con dominios `example.invalid`, IDs `demo-123`, temas bakery/books/pets/planets.
- **R1.5 — Dos proyectos distintos con el mismo bug Vertex deben producir el mismo issue público** salvo metadata segura (versión, package id, error code, runtime family, OS family). Esta es la propiedad fuerte de privacidad de §3.2.
- **R1.6 — Reporter no acepta `toolName` arbitrario** (Track D — x00245). Solo `ISafeToolIdentity` resuelto vía registry metadata.
- **R1.7 — `internalOnly:false` no existe** (Track D — b00236). El reporting externo es imposible por configuración; cualquier valor histórico debe fallar cerrado o ignorarse con warning de deprecación.

### N. R2 — Code quality (Clean Code + SOLID + reuse)

Reflejado en `AGENT-BOOTSTRAP.md §6`. Cada hija debe respetarlo:

- **R2.1 — SOLID** (SRP, OCP, LSP, ISP, DIP) por defecto, sin recordatorio.
- **R2.2 — Clean Code**: nombres intention-revealing, funciones pequeñas y de un solo propósito, comentarios solo cuando explican *por qué*, sin errores tragados, sin código muerto, sin magic numbers, sin ramas comentadas.
- **R2.3 — Reusable code**: interfaces estrechas, registries en lugar de cadenas largas de `switch`/`if-else`, dependency injection, sin duplicación dolorosa, helpers compartidos.
- **R2.4 — Best practices**: tests para lógica no trivial, validación en bordes I/O, bajo acoplamiento, alta cohesión, strict types, dependencias declaradas.

Excepciones aceptables únicamente si: (a) el usuario pide relajación explícita, o (b) las instrucciones vinculantes del propio proyecto lo imponen. Si una excepción aplica, declararla en `non-goals`.

### N. R3 — Mantenibilidad de carpetas/archivos/naming

- **R3.1 — Coherencia de naming** con el resto del repo. Kebab-case para archivos `.md` de propuestas; `<prefijo><NNNNN>-<título-kebab>.md`.
- **R3.2 — Una sola fuente de verdad** para datos machine-readable (plugin id, summary, permissions, presets, version, maturity, token budget). Lo manual es solo editorial.
- **R3.3 — Naming architecture estable**: los plugins, services, contracts, helpers, tests siguen la misma jerarquía ya existente. No crear nuevas formas a menos que la propuesta justifique el cambio arquitectónico.
- **R3.4 — Documentación actualizada** en cada cambio de superficie pública (tool list, output schema, permissions). El catálogo web se regenera desde manifests; las páginas `apps/web/src/data/pages/...` no mantienen listas de plugins a mano.

### N. R4 — Tokens son constraints, no números a subir

- **R4.1** — Nunca se sube un presupuesto para hacer pasar un test. Si un preset rompe su hard budget, se reduce el coste primero.
- **R4.2** — Toda propuesta que añada tools o schemas debe medir `staticBytes` antes/después.
- **R4.3** — El dashboard de tokens se regenera automáticamente; `tokens:dashboard:check` debe pasar.

### N. R5 — Invariantes como APIs/lints, no tribal knowledge

- **R5.1** — Si dos plugins pueden necesitar la misma garantía (filesystem containment, network allowlist, process safety), esa garantía se convierte en API pública del core.
- **R5.2** — Si una clase de bug puede reintroducirse (p. ej. `readFile(resolve(workspaceRootAbs, userPath))`), se añade un lint arquitectónico que lo bloquee en CI.

### N. R6 — Cerrar con evidencia

Cada hija debe cerrar con `resolution.evidence` que incluya al menos:

- commit hash;
- gates ejecutados (typecheck, lint, tests, security, runtime verify, token budget);
- before/after metric cuando aplique;
- link al test adversario cuando aplique.

---

# Tracks y propuesta-a-propuesta

### N. Track A — Filesystem security (P1)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                             |
| --------- | ----- | --------- | --------------------------------------------------------------- |
| `x00241`  | fix   | P1        | FS2-001 + FS2-002 (parcial) — `SafeWorkspaceReader` API pública |
| `x00242`  | fix   | P1        | FS2-001 — `context-for-change` containment                      |
| `x00243`  | fix   | P1        | FS2-002 — `impact-analysis` + `tests-for-change` containment    |
| `c00004`  | chore | P2        | FS2-003 — lint arquitectónico que bloquea nuevos escapes        |

**Objetivo del track**: hacer **técnicamente imposible** que un plugin con permiso `filesystem-read` pueda abrir una ruta exterior al workspace. La garantía se centraliza en una API `SafeWorkspaceReader` (Track A) y se blinda con un lint arquitectónico que falla el CI si alguien la esquiva.

### N. Track B — Concurrency (P1)

| Propuesta | ID   | Prioridad | Hallazgos cubiertos                                                |
| --------- | ---- | --------- | ------------------------------------------------------------------ |
| `t00028`  | test | P1        | MUT2-001 — test determinista de race de stale reclaim              |
| `x00244`  | fix  | P1        | MUT2-001 — rediseño del reclaim con lease/generation o equivalente |
| `t00008`  | test | P1        | MUT2-001 — property tests sobre la state machine del mutex         |

**Objetivo del track**: reproducir o descartar la race window entre `observation` y `rename` durante stale reclaim. Si se reproduce, rediseñar el reclaim (lease/generation, reclaim marker visible, rename protocol atómico). Nunca dos holders simultáneos bajo heartbeat concurrente, crash, stale reclaim o 3+ contenders.

### N. Track C — Tokens (P1/P2)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                                     |
| --------- | ----- | --------- | ----------------------------------------------------------------------- |
| `c00005`  | infra | P1        | TOK2-001 + TOK2-002 — gate CI real con ensamblado real del preset swarm |
| `c00006`  | infra | P2        | TOK2-003 — `tokens:dashboard:check` en CI                               |
| `r00018`  | refac | P2        | TOK2-005 — reducción del coste estático de `proposals` (target <40 KB)  |
| `r00019`  | refac | P2        | TOK2-004 — estrategia default `adaptive` con benchmark                  |
| `c00007`  | infra | P2        | TOK2-006 — presupuesto explícito para `vertex`                          |

**Objetivo del track**: que el `swarm` real quede **<= hard budget** y preferiblemente **<= warning**; que el CI falle si el preset real supera el techo; que el dashboard tracked esté sincronizado con HEAD; que `proposals` pierda ~50% de su coste estático sin perder tipado estricto.

### N. Track D — PRIVACY (P0 — MÁXIMO ÉNFASIS LEGAL)

| Propuesta | ID       | Prioridad | Hallazgos cubiertos                                                      |
| --------- | -------- | --------- | ------------------------------------------------------------------------ |
| `x00245`  | fix      | P0        | ER2-001 — provenance segura de `toolId` (`ISafeToolIdentity` registry)   |
| `b00236`  | breaking | P0        | ER2-002 — retirar `internalOnly:false`; reporting imposible por config   |
| `x00237`  | fix      | P0        | ER2-003 — fuente canónica de `mcpVertexVersion` (build-time injected)    |
| `t00009`  | test     | P0        | Privacy adversarial regression suite (dos hosts, mismo bug, mismo issue) |

**Objetivo del track**: que `error-reporting` no pueda, **bajo ninguna configuración**, emitir nombres de tools del host, paths del proyecto, IDs de cliente, ni nada que pertenezca al espacio del usuario. Que dos proyectos privados con el mismo bug Vertex produzcan el mismo issue público (propiedad fuerte de privacidad §3.2). **Este track tiene precedencia absoluta sobre el resto**; si bloquea otros, se desbloquea primero.

**Reglas R1.1–R1.7** son invariantes. Cualquier regresión aquí es P0 + escalation al owner.

### N. Track E — Manifests (P2)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                             |
| --------- | ----- | --------- | --------------------------------------------------------------- |
| `f00174`  | feat  | P2        | MAN2-001 + MAN2-002 — autodiscovery + manifest obligatorio      |
| `f00175`  | feat  | P2        | MAN2-003..006 — registry/web/docs/permissions generados         |
| `c00008`  | infra | P2        | MAN2-007 — validación manifest ↔ package.json + visibility      |
| `c00009`  | infra | P2        | MAN2-008 — validación manifest ↔ preset catalog (gate completo) |

**Objetivo del track**: que `plugin.manifest.ts` sea la **única** fuente para id, package, version, visibility, summary, tags, maturity, permissions, toolPermissions, presets, tokenBudget, dependencies, capabilities. Eliminar `MIGRATED_PLUGIN_IDS`. Registry, web catalog, docs, permission matrix y preset compatibility matrix se generan automáticamente desde manifests.

### N. Track F — Quality (P2/P3)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                                 |
| --------- | ----- | --------- | ------------------------------------------------------------------- |
| `x00238`  | fix   | P3        | ADOPT2-001 — `EXACT_ADOPTION_WRITE_ESTIMATE` derivado del plan real |
| `x00239`  | fix   | P3        | PROC2-001 — edge UTF-8 al recortar chunks de proceso                |
| `x00240`  | fix   | P3        | MEM2-002 — disposer del plugin cierra `fs.watch` + debounce timer   |
| `r00020`  | refac | P2        | PRE2-001 + PRE2-002 — summaries y presupuestos derivados por preset |

**Objetivo del track**: precisión (adoption ya no miente con un 25 fijo), seguridad de bytes en procesos, lifecycle de memory (watcher dispose), y coherencia entre summaries editados y membership real.

### N. Track G — CI / gobernanza (P2)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                          |
| --------- | ----- | --------- | ------------------------------------------------------------ |
| `c00010`  | infra | P2        | CI2-001 — required checks en branch policy                   |
| `c00011`  | infra | P2        | CI2-003 + CI2-005 — generator checks + workflow run evidence |

**Objetivo del track**: que ningún agente pueda dejar `develop` en rojo silenciosamente. Required checks mínimos: typecheck, tests, architecture, security, runtime verify, token budget real. Los generadores (manifests, token dashboard, web catalog) deben fallar CI si quedan desincronizados.

### N. Track H — Surface runtime (P2)

| Propuesta | ID    | Prioridad | Hallazgos cubiertos                                                           |
| --------- | ----- | --------- | ----------------------------------------------------------------------------- |
| `r00021`  | refac | P2        | SURF2-001 + SURF2-002 — `notifications/tools/list_changed` + bootstrap mínimo |
| `f00176`  | feat  | P2        | SURF2-003 — surface mode por `clientInfo/capabilities`                        |

**Objetivo del track**: que la activación dinámica sea la experiencia normal, no un fallback. Que el bootstrap exponga solo orientation/discovery/activation/status/routing. Que el surface mode se decida por capacidades declaradas del cliente (no por heurística de nombre).

---

# Cobertura de secciones transversales de la auditoría

- **§1.1 (estado global)** y **§28 (bugs ya cerrados)** → reconocidos como `ALREADY_FIXED`. No reabrir.
- **§3 (invariante de privacidad)** → reglas R1.1–R1.7 de este plan + Track D entero.
- **§10 (surface runtime)** → Track H.
- **§17 (project health)** → filosofía preservada; no se reabre PH2-001; PH2-002 cubierto por F-quality (lazy detail).
- **§22 (core split)** → `CORE2-001`: no dividir paquetes todavía. Se respeta como non-goal global.
- **§29 (KPIs)** → métricas locales que las hijas exponen en sus `resolution.evidence` (no se reportan externamente).
- **§30 (privacy classes)** → R1.1 + clase A en `ISafeMcpVertexReport`; clases B/C/D prohibidas en el DTO.
- **§32 (pipeline seguro)** → x00214 (predecesor) + x00245/b00236/x00237 de este plan.
- **§37 (P0–P3)** → reflejan el orden de tracks de este plan.
- **§41 (10 principios)** → re-enumerados como R1–R6 + resto de las reglas globales.

---

# Slices

- global_gate: type

## Slices

### S1 — Orquestar las 28 hijas a `done`

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md`
- **Gate**: type
- acceptance:
  - "Cada hija cierra sus slices y pasa peer review (`requireAllChildrenDone + requireAllSlicesDone`)."
  - "La tabla de tracks/propuestas de este plan se actualiza con el estado real de cada hija al avanzar."
  - "El cierre se realiza con `proposals_close_plan`, que no devuelve blockers."
  - "`requireEvidenceOnClose` exige `resolution.evidence` con commit + gates + before/after metric en cada hija."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — La revisión independiente confirma 27 hijas done; c00010 retirada por supersesión y t00028/t00012 cubren concurrencia. Evidencia focalizada: core hooks 16/16, logs 34/34, token dashboard check OK y generated artifacts check OK.
## acceptance

Criterios de aceptación globales (verificados a través de las hijas):

### Seguridad

- `context-for-change` no abre rutas exteriores (`x00242` + tests).
- `impact-analysis` no abre rutas exteriores (`x00243` + tests).
- `SafeWorkspaceReader` es API pública usada por ambos plugins (`x00241`).
- Symlink escape bloqueado (test adversarial en `x00241`).
- El lint arquitectónico (`c00004`) falla si algún plugin futuro evade la API.
- `error-reporting` no envía tool ids externos (`x00245`).
- `internalOnly:false` no existe en schema ni en runtime (`b00236`).
- `mcpVertexVersion` proviene de la versión publicada, no del root `package.json` (`x00237`).
- Privacy adversarial suite verde: dos hosts distintos con el mismo bug Vertex producen el mismo issue público (`t00009`).

### Concurrencia

- Stale reclaim race reproducido o descartado con test determinista (`t00028`), endurecido posteriormente por `t00012`.
- Rediseño aplicado si se reproduce; nunca dos holders simultáneos bajo heartbeat concurrente, crash, stale reclaim o 3+ contenders (`x00244`).
- Property tests sobre la state machine del mutex (`t00008`).

### Tokens

- Real swarm <= hard budget (medición con ensamblado real, `c00005`).
- CI falla si real swarm > hard budget (`c00005`).
- `tokens:dashboard:check` integrado en CI (`c00006`).
- `proposals` static cost reducido a target <40 KB (`r00018`) o justificado.
- `vertex` tiene hard/warning explícitos (`c00007`).
- Decisión de default `adaptive` documentada con benchmark (`r00019`).

### Manifests

- Todos los plugins públicos con manifest (`f00174`).
- `MIGRATED_PLUGIN_IDS` eliminado; autodiscovery activa (`f00174`).
- Registry/web catalog/docs/permissions generados desde manifests (`f00175`).
- `manifest ↔ package.json` validado en CI (`c00008`).
- `manifest ↔ preset catalog` validado como gate completo (`c00009`).

### Quality

- UTF-8 edge en process capture cubierto por test (`x00239`).
- `EXACT_ADOPTION_WRITE_ESTIMATE` derivado del plan real o marcado `exact:false` (`x00238`).
- Memory plugin dispose cierra `fs.watch` + debounce timer (`x00240`).
- Preset summaries y presupuestos derivados del membership real (`r00020`).

### CI / gobernanza

- Required checks definidos en `develop` policy (`c00010`).
- Manifest generator + token dashboard + workflow run evidence en CI (`c00011`).

### Surface

- `notifications/tools/list_changed` validado contra cliente MCP real (`r00021`).
- Bootstrap mínimo medido (`r00021`).
- Surface mode por `clientInfo/capabilities` (`f00176`).

---

# Orden de ejecución recomendado (para el agente orquestador)

El orden refleja precedencia técnica y legal. Track D es **P0** y bloquea por defecto.

1. **Track D privacidad** completo: `x00245` → `b00236` → `x00237` → `t00009`. **NO continuar con otros tracks hasta que Track D esté `done` con peer review verde.**
2. **Track A filesystem**: `x00241` (API) → `x00242` (context-for-change) → `x00243` (impact-analysis) → `c00004` (lint). El lint (`c00004`) cierra el track.
3. **Track B concurrency**: `t00007` (repro) → `x00244` (fix) → `t00008` (property tests). El test de repro precede al fix.
4. **Track C tokens**: `c00005` (gate real) → `c00006` (dashboard check) → `r00018` (schema diet) → `r00019` (adaptive default) → `c00007` (vertex budget).
5. **Track E manifests**: `f00174` (autodiscovery) → `f00175` (generated artifacts) → `c00008` (validación package) → `c00009` (validación preset).
6. **Track F quality**: `x00238` (adoption exact) → `x00239` (utf-8) → `x00240` (memory dispose) → `r00020` (preset summaries).
7. **Track G CI**: `c00010` quedó supersedida por la decisión de gobernanza de `q00005` (`c00017`/`c00018`); `c00011` conserva los generator gates + evidence.
8. **Track H surface**: `r00021` (listChanged + bootstrap) → `f00176` (surface mode capability).

Cuando q00003 y q00004 estén ambos `done` con peer review, MCP Vertex queda aproximadamente en la posición objetivo definida en la auditoría §48.

---

# Definition of Done de este plan

- Las 28 hijas están `done` con peer review verde.
- Los criterios de aceptación globales están todos verificados con evidencia (`resolution.evidence`).
- Los generated artifacts (registry, web catalog, docs, permissions, token dashboard) están sincronizados con HEAD.
- `bun run validate` verde en el commit de cierre.
- `proposals_close_plan` no devuelve blockers.
- Una tercera auditoría (cuando llegue) no vuelve a encontrar las mismas clases de bug en las dimensiones aquí cubiertas.
---

# resolution

```yaml
resolution:
  status: review
  evidence:
    plan-completion-date: 2026-08-25
    validate:
      exit_code: 0
      test_files_passed: 908
      test_files_total: 908
      tests_passed: 6954
      tests_skipped: 1
      tests_total: 6955
      adversarial_suites:
        privacy: "13/13 tests pass (t00009)"
        safe-workspace-reader: "all plugins migrated, 0 violations"
    children:
      all_in_review: 27
      requires_peer_review_pass: true
    commits:
      track-d-privacy-p0:
        - { id: b00236, kind: breaking, hash: d98e0528, summary: "retire internalOnly config surface" }
        - { id: x00237, kind: fix, hash: cc866ce4, summary: "source mcpVertexVersion from core" }
        - { id: x00245, kind: fix, hash: 0d546d5e, summary: "derive safe tool identity from registry" }
        - { id: t00009, kind: test, hash: 24cdfab6, summary: "privacy adversarial regression suite" }
      track-a-filesystem-p1:
        - { id: x00241, kind: fix, hash: 9819d8fe, summary: "add safe workspace reader API" }
        - { id: x00242, kind: fix, hash: 7eea421d, summary: "route context-for-change through safe reader" }
        - { id: x00243, kind: fix, hash: 07bc49ac, summary: "route impact-analysis through safe reader" }
        - { id: c00004, kind: chore, hash: d1727fe9, summary: "block direct readFile outside safe reader" }
      track-b-concurrency-p1:
        - { id: t00028, kind: test, hash: 56862d60, summary: "race reproduction for stale reclaim" }
        - { id: x00244, kind: fix, hash: 56862d60, summary: "harden with-file-mutex stale reclaim" }
        - { id: t00008, kind: test, hash: 56862d60, summary: "property tests state machine" }
      track-c-tokens:
        - { id: c00005, kind: chore, hash: 82c54bcc, summary: "real swarm budget gate in CI" }
        - { id: c00006, kind: chore, hash: 82c54bcc, summary: "token dashboard CI check" }
        - { id: c00007, kind: chore, hash: 82c54bcc, summary: "vertex preset explicit budget" }
        - { id: r00018, kind: refactor, hash: 82c54bcc, summary: "proposals schema diet 76.2KB -> 67.7KB" }
        - { id: r00019, kind: refactor, hash: 82c54bcc, summary: "adaptive surface benchmark + default" }
      track-e-manifests:
        - { id: f00174, kind: feat, hash: 82c54bcc, summary: "per-plugin manifest autodiscovery" }
        - { id: f00175, kind: feat, hash: 82c54bcc, summary: "registry, web catalog, docs, permissions generated" }
        - { id: c00008, kind: chore, hash: 82c54bcc, summary: "manifest vs package.json lint" }
        - { id: c00009, kind: chore, hash: 82c54bcc, summary: "manifest vs preset catalog lint" }
      track-f-quality:
        - { id: x00238, kind: fix, hash: b9009bb8, summary: "derive adoption write estimate from plan" }
        - { id: x00239, kind: fix, hash: 15cc1e95, summary: "preserve utf8 boundaries in process output" }
        - { id: x00240, kind: fix, hash: 9a2ff04b, summary: "dispose memory watcher resources" }
        - { id: r00020, kind: refactor, hash: 916c0673, summary: "preset summaries from membership" }
      track-g-ci:
        - { id: c00010, kind: chore, hash: superseded, summary: "superseded by q00005 c00017/c00018; develop remains intentionally open" }
        - { id: c00011, kind: chore, hash: e1ee275a, summary: "generators gate + workflow run evidence" }
      track-h-surface:
        - { id: r00021, kind: refactor, hash: 5e47ecb1, summary: "listChanged notification + bootstrap min" }
        - { id: f00176, kind: feat, hash: 5e47ecb1, summary: "negotiate surface mode from client capabilities" }
    metrics:
      before:
        privacy_risk: "internalOnly:false config exposure; toolId leaked from arbitrary toolName"
        filesystem_risk: "context-for-change + impact-analysis had direct readFile with normalizePath vuln"
        concurrency_risk: "with-file-mutex had theoretical race in stale reclaim window"
        token_budget: "swarm exceeded hard budget; proposals static cost 76.2 KB"
        manifest_drift: "MIGRATED_PLUGIN_IDS override; manual web catalog, docs and permissions"
      after:
        privacy: "internalOnly eliminated; safeToolId registry-driven; 2-host adversarial suite"
        filesystem: "SafeWorkspaceReader is the only public read API; lint c00004 enforces repo-wide"
        concurrency: "lease + generation + grace period; never two holders under any concurrent scenario"
        token_budget: "real swarm gate in CI; vertex preset explicit hard/warning; adaptive mode saves ~96 percent"
        manifest_drift: "all artifacts generated from manifests; manifest-vs-package and manifest-vs-presets lints enforce"
    project_rules_respected:
      - "R1 privacy by construction (no redaction)"
      - "R2 SOLID + clean code + reusable"
      - "R3 stable folder/naming architecture"
      - "R4 tokens as constraints (budgets not raised to make tests pass)"
      - "R5 invariants as APIs/lints"
      - "R6 close with evidence"
```
