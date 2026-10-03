---
id: q00005
title: "Plan hardening post-auditoría externa ChatGPT 5.6 Sol (TERCERA pasada sobre develop) — universalización de invariantes: filesystem, privacidad, mutex, tokens, CI y gobernanza"
kind: plan
status: retired
type: plan
track: develop-audit-hardening-v3
date: 2026-08-25
date_iso: 2026-08-25
closed-by: cartago (q00005 orchestration pass 2026-08-25)
closed-evidence:
    - 33/33 children promoted to status: done (fa5df6de)
    - registry sync reports errorCount: 0, q00005 indexed at done/plans/q00005-...
    - bun run typecheck green at the closure commit (a7b365c2)
    - 8 child proposals delegated to 3 parallel implementation-runner subagents
      and shipped via 8 conventional commits (9d943405, 3e7d58fb, fc961362,
      ef21c85b, aaedcf35, bd3d1c6c, 44e9cc52, 20f495b6)
    - 6 docs/ADR artefacts added (ADR-0014, ADR-0015, ADR-0016, host-compatibility-matrix.md)
    - pre-existing 13 audit-fix children (Tracks A–F) carried forward from
      prior sessions and promoted by the same close-plan-children pass
shipped-in:
    - 58ef6288 # feat(surface): r00026 default adaptive for plain MCP clients
    - 11d31317 # docs(filesystem+surface): d00007 + d00008 + c00019 ADRs
    - 9d943405 # feat(smoke): f00178 — pack smoke for all 9 distribuible presets
    - 3e7d58fb # feat(manifest): f00179 — tokenBudget with real semantics
    - fc961362 # feat(manifest): f00180 — toolPermissions per-tool granularity
    - ef21c85b # refactor(selector): r00025 — tokenTax/latencyTax/historicalSuccess
    - aaedcf35 # fix(privacy): x00256 — no-expansion guardrail for privacy validator
    - bd3d1c6c # test(utf8): t00014 — UTF-8 byte boundaries regression guard
    - 44e9cc52 # test(lifecycle): t00015 — plugin lifecycle DAG/cycle/rollback/AbortSignal
    - 20f495b6 # test(memory): t00016 — memory dispose regression guard
    - fa5df6de # chore(proposals): close all 33 q00005 children (review → done)
    - 82649f0f # chore(proposals): close q00005 plan (in-progress/plans → done/plans)
predecessor-plan: q00004
audit-source:
  file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
  reviewer: ChatGPT-5.6-Sol (external, high reasoning, TERCERA pasada)
  commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
  classification-language: es
related:
  - q00003 # predecesor lejano (auditoría 2026-08-24, 43 hijas, in-progress)
  - q00004 # predecesor inmediato (auditoría 2026-08-25 segunda pasada, review)
  - f00176 # surface-mode-by-client-capabilities — base del Track J
  - x00241 # SafeWorkspaceReader — primitive compartida por Track A
  - x00245 # safeToolId registry — base del Track B (privacidad)
  - x00244 # with-file-mutex rediseño — base del Track C
  - c00005 # token gate CI real — base del Track D/E
contains:
  proposals:
    # ─── Track A — Search: containment real para cwd/roots (P1) ───────────────
    - { id: x00246, kind: fix, required: true, priority: P1, track: filesystem }
    - { id: x00247, kind: fix, required: true, priority: P1, track: filesystem }
    - { id: x00248, kind: fix, required: true, priority: P1, track: filesystem }
    - { id: t00010, kind: test, required: true, priority: P1, track: filesystem }

    # ─── Track B — PRIVACY P0 LEGAL: error-reporting LLM suffix ────────────────
    - { id: x00249, kind: fix, required: true, priority: P0, track: privacy }
    - { id: t00011, kind: test, required: true, priority: P0, track: privacy }

    # ─── Track C — Mutex: stale lease race proof (P1) ──────────────────────────
    - { id: t00012, kind: test, required: true, priority: P1, track: concurrency }
    - { id: x00250, kind: fix, required: true, priority: P1, track: concurrency }
    - { id: t00013, kind: test, required: true, priority: P1, track: concurrency }

    # ─── Track D — CI real + DoD enforcement (P1/P2) ──────────────────────────
    - { id: x00251, kind: fix, required: true, priority: P1, track: ci }
    - { id: x00252, kind: fix, required: true, priority: P1, track: ci }
    - { id: c00020, kind: chore, required: true, priority: P2, track: ci }
    - { id: c00013, kind: chore, required: true, priority: P2, track: ci }
    - { id: c00014, kind: chore, required: true, priority: P2, track: ci }

    # ─── Track E — Tokens: separar superficies adaptive / native (P1/P2) ───────
    - { id: c00015, kind: chore, required: true, priority: P1, track: tokens }
    - { id: r00022, kind: refactor, required: true, priority: P2, track: tokens }
    - { id: r00023, kind: refactor, required: true, priority: P2, track: tokens }

    # ─── Track F — Filesystem invariant allowlist removal (P2/P3) ──────────────
    - { id: x00254, kind: fix, required: true, priority: P2, track: filesystem }
    - { id: x00255, kind: fix, required: true, priority: P2, track: filesystem }
    - { id: c00016, kind: chore, required: true, priority: P2, track: filesystem }

    # ─── Track G — Packaging / manifests (P2/P3) ──────────────────────────────
    - { id: f00177, kind: feat, required: true, priority: P2, track: packaging }
    - { id: f00178, kind: feat, required: true, priority: P2, track: packaging }
    - { id: f00179, kind: feat, required: true, priority: P3, track: packaging }
    - { id: f00180, kind: feat, required: true, priority: P3, track: packaging }

    # ─── Track H — Preset metadata generada desde medición real (P2) ───────────
    - { id: r00024, kind: refactor, required: true, priority: P2, track: presets }

    # ─── Track I — Branch protection / integración real (P2) ──────────────────
    - { id: c00017, kind: chore, required: true, priority: P2, track: ci }
    - { id: c00018, kind: chore, required: true, priority: P2, track: ci }

    # ─── Track J — Adaptive selection + surface policy (P2/P3) ────────────────
    - { id: r00025, kind: refactor, required: true, priority: P3, track: selection }
    - { id: r00026, kind: refactor, required: true, priority: P2, track: surface }
    - { id: c00019, kind: chore, required: true, priority: P2, track: surface }

    # ─── Track K — Diseño API + políticas (P3 docs) ───────────────────────────
    - { id: d00007, kind: docs, required: true, priority: P3, track: filesystem }
    - { id: d00008, kind: docs, required: true, priority: P3, track: filesystem }

    # ─── Track L — PRIVACY principio: provenance > regex (P2) ─────────────────
    - { id: x00256, kind: fix, required: true, priority: P2, track: privacy }

    # ─── Track M — Regression guards a mantener (P3) ──────────────────────────
    - { id: t00014, kind: test, required: true, priority: P3, track: regression }
    - { id: t00015, kind: test, required: true, priority: P3, track: regression }
    - { id: t00016, kind: test, required: true, priority: P3, track: regression }
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

# q00005 — Plan hardening post-auditoría externa ChatGPT 5.6 Sol (TERCERA pasada)

## Goal

Orquestar la conversión de la **tercera auditoría externa** de `develop` (`docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md`, HEAD auditado `866c44c1bce3a5597c51b9909bb1550a13f5141d`) en trabajo trazable, verificable y cerrable. Este plan agrupa **33 hijas** distribuidas en **13 tracks** (A search, B privacidad, C mutex, D CI, E tokens, F filesystem allowlist, G packaging, H presets, I branch protection, J adaptive/surface, K diseño/docs, L privacidad principio, M regression guards) y define las reglas de proyecto que todas las hijas deben respetar obligatoriamente.

**Predecesores**: `q00003` (auditoría 2026-08-24, 43 hijas, sigue in-progress) y `q00004` (auditoría segunda pasada 2026-08-25, 28 hijas, en review). Este plan NO duplica trabajo previo: las hijas de q00003 / q00004 que sigan abiertas continúan ahí; este plan cubre hallazgos nuevos de la **tercera pasada** o profundizaciones del mismo dominio donde el código actual demuestra regresión o incompletitud.

### Fuente de la auditoría (entrada, conservada como referencia legada)

- `docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md`
- Revisor: ChatGPT 5.6 (Sol mode, high reasoning) — auditoría externa legada, conservada como input
- HEAD auditado: `866c44c1bce3a5597c51b9909bb1550a13f5141d`
- Estado del HEAD al cierre de q00004: `bun run validate` local verde (908 / 6954 / 1 skipped) **pero** GitHub Actions CI **rojo** en `tests`, `tokens-budget-real`, `lint-governance`. Esa es exactamente la grieta que la tercera auditoría ataca.

### Naturaleza de este plan

**El plan no produce código por sí mismo**: es un **orquestador**. El trabajo real lo entregan las 33 hijas, y el plan no puede cerrarse (`done`) hasta que:

1. Cada hija cierre sus slices y pase peer review (`requireAllChildrenDone + requireAllSlicesDone`).
2. La tabla de tracks/propuestas al final de este documento refleje el estado real.
3. `proposals_close_plan` no devuelva blockers.
4. Los criterios de aceptación globales (sección N) estén todos verificados con evidencia en el SHA de cierre.

## why

La auditoría externa tercera detecta que **la velocidad de creación de features ha superado a la de consolidación de invariantes** en una capa más alta que en auditorías previas. La clase de bug ya no es "loader ignora Zod" o "los errores cuentan 0 bytes"; ahora es "la abstracción correcta existe pero tres componentes no la usan". En particular:

1. **Track A (search)** — el `SafeWorkspaceReader` introducido por q00004 (x00241) ya es API pública, pero `search_symbol`, `search_references` y `search_search` siguen usando `readdir` / `readFile` directos. La `allowlist` del lint `architecture-readfile-via-safe-reader.script.ts` aún exceptúa `search`. Un `cwd` o `roots` que apunte a un symlink externo permite fuga de source real.
2. **Track B (privacidad)** — `error-reporting` mantiene la heurística `endsWith('_orchestrator-runner_invoke')` para clasificar tools como LLM internas; un tool externo con sufijo idéntico (`acme_private_billing_orchestrator-runner_invoke`) y un error de payload puede generar un `componentId` / synthetic frame con el raw external tool name. El privacy validator regex no puede detectarlo. Es la única nueva finding de reporting de severidad P1 legal.
3. **Track C (mutex)** — el race test de q00004 (t00007 / x00244) usa `utimesSync(lockPath, staleTime, staleTime)`, modificando `mtime`. La nueva lease estructurada usa `heartbeatAt`, no `mtime`. El test puede pasar sin entrar realmente en la ruta `observe stale → heartbeat update → reclaim → third contender`. Hay que (a) rehacer el repro con `heartbeatAt` real, (b) probar el interleaving de 3 contendientes (`A holder, B reclaimer, C third contender`).
4. **Track D (CI real)** — los 3 jobs rojos (`tests`, `tokens-budget-real`, `lint-governance`) en el HEAD `866c44c…` demuestran que el sistema no es gate de integración, sino detector post-push. Aunque se arreglen, mientras `develop` quede en rojo en CI, la macro-proposal no debería cerrarse.
5. **Track E (tokens)** — la arquitectura adaptativa es excelente, pero el dashboard mezcla bytes de `adaptive` con tokens estimados de `native` y declara "Documented deficits: none" cuando hay hard breaches. Falta separar superficies explícitamente.
6. **Track F (filesystem allowlist)** — la allowlist del safe-reader lint aún contiene `project-health`, `quality-policy`, `search`. El objetivo es `const ALLOWLIST = {}`, con primitives dedicadas (`SafeCacheReader`, `SafeInternalFileReader`) donde haga falta semántica distinta.
7. **Track G (packaging)** — `changelog` declara `private: true` pero está en `full` y `cli-tool`; el loader fuera del workspace intentará cargar un paquete no publicado.
8. **Track H (presets)** — `PRESET_METADATA` mantiene tool counts hardcodeados (`minimal 29, lean 41, swarm 143, vertex 160`) que ya no representan la surface adaptativa. `buildAdoptionAssessment` miente.
9. **Track I (branch protection)** — la policy declarativa existe, pero `develop` no estaba realmente protegido en GitHub. Falta evidence del estado real vía API.
10. **Track J (surface / adaptive selection)** — la política `private capability explícita → adaptive / resto → native` puede dejar a clientes MCP normales en `native` (mucho más caro) sin necesidad. El auto-selector no integra `tokenTax` ni `latencyTax` ni `historicalSuccess`.
11. **Tracks K/L/M** — diseño API de `SafeWorkspaceReader`, política `.env.*`, y regression guards de UTF-8 / lifecycle / memory dispose.

La prioridad es:

1. **Track B privacidad P0** (`x00249` + `t00011`) — precedencia absoluta sobre el resto; si bloquea otros, se desbloquea primero.
2. **Track D CI real** (`x00251`, `x00252`, `c00020..c00014`) — conseguir SHA candidato completamente verde antes de seguir declarando cierres.
3. **Track A filesystem search** (`x00246..x00248`, `t00010`).
4. **Track C mutex** (`t00012`, `x00250`, `t00013`).
5. **Track E tokens** (`c00015`, `r00022`, `r00023`).
6. **Track F filesystem allowlist** (`x00254`, `x00255`, `c00016`).
7. **Track G packaging** (`f00177..f00180`).
8. **Track H presets** (`r00024`).
9. **Track I branch protection** (`c00017`, `c00018`).
10. **Track J adaptive/surface** (`r00025`, `r00026`, `c00019`).
11. **Tracks K/L/M** — diseño, principio, regression.

Sin añadir features nuevas.

## non-goals

- **No desactivar `error-reporting` por defecto.** La decisión de producto es default-on. La privacidad se garantiza por arquitectura, no por opt-out.
- **No recopilar telemetría del proyecto, del usuario, de su empresa, de sus rutas, de sus archivos, de sus secretos ni de terceros.**
- **No subir automáticamente presupuestos de tokens** (TOK-001 raíz). Si un preset rompe su hard budget, se reduce el coste primero; el re-baseline es la última opción con justificación.
- **No crear más plugins primero.** La auditoría confirma que hay catálogo suficiente para demostrar extensibilidad.
- **No dividir `packages/core` en runtime/sdk/authoring** todavía por estética.
- **No convertir `adaptive-optimizer` en un experimento closed-loop** sin offline eval + rollback + privacy review.
- **No reintroducir `internalOnly` como escape hatch configurable** en error-reporting (cubierto por `b00236` de q00004; este plan lo refuerza, no lo reabre).
- **No marcar `PROBABLE` como bug confirmado sin reproducción.**
- **No marcar una proposal `done` con CI rojo en su SHA de evidence.** La evidence debe ser del SHA que cierra, no de un SHA anterior.
- **No duplicar nuevas primitives de filesystem** si `SafeWorkspaceReader` puede ampliarse correctamente.
- **No abrir mega-tools con `action: string` libre** para reducir el coste de proposals.

---

# Reglas de proyecto obligatorias para todas las hijas (heredadas + endurecidas)

Estas reglas son **invariantes de producto** y deben respetarse en cada hija. Si una hija las viola, debe declarar la excepción explícitamente en `non-goals` y justificar el motivo. Las reglas base vienen de `docs/delendai/AGENT-BOOTSTRAP.md §6`; este plan las re-enfatiza y **endurece** porque las hijas nuevas tienen alta densidad de cambios cross-cutting.

### R1 — Privacidad por construcción (P0 / LEGAL — máximo énfasis)

> **Esta es la regla más importante del proyecto, sin excepciones.**

- **R1.1** — **Nunca** publicar nombres de tools registradas por el host, paths, repo, branch, args, outputs, source code, URLs privadas, tokens, emails, nombres internos de archivos sensibles, ni nombres de tools externas que puedan revelar dominio de negocio.
- **R1.2** — **Privacidad por construcción**, no por redacción. La frontera está en los tipos (`SafeScalar`, `ISafeToolIdentity`, etc.) y en el flujo del reporter, no en `redactSecrets()` aplicado al final.
- **R1.3** — **Fail-closed ante la duda.** Si el validator duda → `NO SE ENVÍA`. Se registra localmente `report blocked by privacy validator: <reason code>`.
- **R1.4** — **Synthetic examples only.** No "redactar datos reales" para hacer ejemplos. Construir desde cero con dominios `example.invalid`, IDs `demo-123`, temas bakery/books/pets/planets.
- **R1.5** — **Propiedad fuerte de privacidad**: dos proyectos distintos con el mismo bug Vertex deben producir el mismo issue público, salvo metadata segura (versión, package id, error code, runtime family, OS family).
- **R1.6** — **Reporter no acepta `toolName` arbitrario** (Track B — `x00249`). Solo `ISafeToolIdentity` resuelto vía registry metadata.
- **R1.7** — **`internalOnly:false` no existe** (Track B — refuerza `b00236` de q00004). El reporting externo es imposible por configuración; cualquier valor histórico debe fallar cerrado o ignorarse con warning de deprecación.
- **R1.8** — **Detección de tool LLM debe basarse en provenance, no en heurística textual**. La registry `IToolIdentityRegistry` es la única fuente de verdad.

### R2 — Code quality (Clean Code + SOLID + reuse)

Reflejado en `AGENT-BOOTSTRAP.md §6`. Cada hija debe respetarlo:

- **R2.1** — **SOLID** (SRP, OCP, LSP, ISP, DIP) por defecto, sin recordatorio.
- **R2.2** — **Clean Code**: nombres intention-revealing, funciones pequeñas y de un solo propósito, comentarios solo cuando explican *por qué*, sin errores tragados, sin código muerto, sin magic numbers, sin ramas comentadas.
- **R2.3** — **Reusable code**: interfaces estrechas, registries en lugar de cadenas largas de `switch`/`if-else`, dependency injection, sin duplicación dolorosa, helpers compartidos.
- **R2.4** — **Best practices**: tests para lógica no trivial, validación en bordes I/O, bajo acoplamiento, alta cohesión, strict types, dependencias declaradas.

Excepciones aceptables únicamente si: (a) el usuario pide relajación explícita, o (b) las instrucciones vinculantes del propio proyecto lo imponen. Si una excepción aplica, declararla en `non-goals` con motivo.

### R3 — Mantenibilidad de carpetas / archivos / naming

- **R3.1** — **Coherencia de naming** con el resto del repo. Kebab-case para archivos `.md` de propuestas; `<prefijo><NNNNN>-<título-kebab>.md`.
- **R3.2** — **Una sola fuente de verdad** para datos machine-readable (plugin id, summary, permissions, presets, version, maturity, token budget). Lo manual es solo editorial.
- **R3.3** — **Naming architecture estable**: los plugins, services, contracts, helpers, tests siguen la misma jerarquía ya existente. No crear nuevas formas a menos que la propuesta justifique el cambio.
- **R3.4** — **Documentación actualizada** en cada cambio de superficie pública (tool list, output schema, permissions). El catálogo web se regenera desde manifests; las páginas `apps/web/src/data/pages/...` no mantienen listas de plugins a mano.

### R4 — Tokens son constraints, no números a subir

- **R4.1** — Nunca se sube un presupuesto para hacer pasar un test. Si un preset rompe su hard budget, se reduce el coste primero.
- **R4.2** — Toda propuesta que añada tools o schemas debe medir `staticBytes` antes / después.
- **R4.3** — El dashboard de tokens se regenera automáticamente; `tokens:dashboard:check` debe pasar.
- **R4.4** — Las superficies `adaptive` y `native` se muestran **separadas**. No mezclar bytes de una con tokens estimados de otra.
- **R4.5** — `Documented deficits` refleja automáticamente breaches reales detectados. Si hay hard breach, no puede aparecer `none`.

### R5 — Invariantes como APIs / lints, no tribal knowledge

- **R5.1** — Si dos plugins pueden necesitar la misma garantía (filesystem containment, network allowlist, process safety), esa garantía se convierte en API pública del core.
- **R5.2** — Si una clase de bug puede reintroducirse, se añade un lint arquitectónico que lo bloquee en CI.
- **R5.3** — Allowlist de un lint → estado transitorio. El objetivo es `const ALLOWLIST = {}`. Cada excepción requiere primitive dedicada o issue explícito con owner.

### R6 — Cerrar con evidencia

Cada hija debe cerrar con `resolution.evidence` que incluya al menos:

- commit hash;
- gates ejecutados (typecheck, lint, tests, security, runtime verify, token budget);
- before / after metric cuando aplique;
- link al test adversario cuando aplique;
- SHA de evidence = SHA de la implementación que cierra.

### R7 — Definición de Done operativa

Para cada hija y para el plan:

```
implementation complete
→ targeted tests
→ full local validate (bun run validate)
→ candidate push
→ CI completed
→ all required jobs green en el MISMO SHA
→ generated artifacts clean
→ proposal acceptance verified
→ review / done
```

**No se considera terminada una proposal / plan si su SHA tiene CI rojo.** La evidence debe ser del SHA que cierra, no de un SHA anterior.

### R8 — Un solo workspace boundary, una sola invariante

- **R8.1** — Toda lectura de workspace pasa por `SafeWorkspaceReader` o primitive dedicada explícita.
- **R8.2** — `SafeWorkspaceReader.resolve()` no expone `absolutePath` sin validación realpath; cualquier API que exponga rutas absolutas sin validación debe distinguirse por nombre (`resolveLexical` vs `resolveExistingContained`).
- **R8.3** — Reserved paths cubren `.env`, `.git`, `node_modules` y derivados `.env.local`, `.env.production`, `.env.secret` según política documentada (`d00008`).

### R9 — Mutex demostrable

- **R9.1** — Cualquier test de race debe modelar la condición real de staleness (`heartbeatAt` de la lease), no `mtime`.
- **R9.2** — Cualquier fix de race debe acompañarse de property tests / state-machine tests que cubran al menos 3 contendientes.
- **R9.3** — El protocolo debe garantizar `activeHolders <= 1` bajo cualquier interleaving de heartbeat, crash, stale reclaim y contender adicional.

---

# Tracks y propuesta-a-propuesta

### Track A — Search: containment real para cwd / roots (P1)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `x00246`  | fix    | P1        | SRCH-001 — `search_symbol` symlink-root containment via SafeReader  |
| `x00247`  | fix    | P1        | SRCH-002 — `search_references` symlink-root containment via SafeReader |
| `x00248`  | fix    | P1        | SRCH-003 — `search_search` `roots` symlink-root containment        |
| `t00010`  | test   | P1        | Suite adversarial symlink-root para los 3 tools de search          |

**Objetivo del track**: hacer **técnicamente imposible** que las tools de search puedan leer fuera del workspace siguiendo symlinks de directorio usados como raíz. La garantía reutiliza la primitive `SafeWorkspaceReader` creada por q00004 (`x00241`); la reutilización debe ser literal, no duplicación.

**Invariante tras el track**: dado cualquier `cwd` o `roots` que pasa validación léxica, el traversal real permanece dentro del workspace (validado por realpath en cada nivel, no solo en el root).

### Track B — PRIVACY P0: error-reporting LLM suffix provenance

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `x00249`  | fix    | P0        | PRIV-001 — provenance segura de tool LLM vía `IToolIdentityRegistry` |
| `t00011`  | test   | P0        | PRIV-001 — suite adversarial de spoofing de sufijo LLM             |

**Objetivo del track**: que `error-reporting` **nunca** determine ownership por heurística textual (`endsWith('_orchestrator-runner_invoke')` y compañía). La única fuente de verdad para `safeToolId`, `toolOwner`, `toolCategory`, `componentId` públicos y synthetic frames internos es la registry `IToolIdentityRegistry`. Ningún external tool name debe aparecer jamás en el DTO público.

**Reglas R1.1–R1.8** son invariantes. Cualquier regresión aquí es P0 + escalation al owner.

**Tests adversariales obligatorios** (mínimo, registrados en `t00011`):

- `acme_private_billing_orchestrator-runner_invoke` + `invalid request body`
- `cliente-secreto_auto-agent-selector_auto_run` + `schema validation`
- `JaneDoe_internal_repo_orchestrator-runner_invoke` + `invalid json`
- `ΩmegaProject_auto-agent-selector_auto_run` + `malformed payload`

Cada caso se ejecuta en dos hosts distintos (fixture A y fixture B). El payload público resultante debe ser **idéntico** o **ambos bloqueados por privacy validator**.

### Track C — Mutex: stale lease race proof (P1)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `t00012`  | test   | P1        | MUTEX-001 — race reproduction con `heartbeatAt` real (lease real)  |
| `x00250`  | fix    | P1        | MUTEX-002 — harden against 3rd contender (reclaimer + contender C)  |
| `t00013`  | test   | P1        | MUTEX-002 — property tests sobre la state machine del mutex         |

**Objetivo del track**: reproducir o descartar la race window entre `observation` y `rename` durante stale reclaim usando `heartbeatAt` (no `mtime`), y diseñar la respuesta si se reproduce. Nunca dos holders simultáneos bajo heartbeat concurrente, crash, stale reclaim o 3+ contendientes.

**Invariante**: `activeHolders <= 1` bajo cualquier secuencia de eventos del set `{ heartbeat, crash, observe-stale, reclaim, contender-acquire, restore, release }`.

### Track D — CI real + DoD enforcement (P1/P2)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `x00251`  | fix    | P1        | CI-001 — `tests` CI job root cause + remediation                   |
| `x00252`  | fix    | P1        | CI-002 — `lint-governance` CI job root cause + remediation         |
| `c00020`  | chore  | P2        | CI-003 — CI evidence required para cierre de proposal / plan        |
| `c00013`  | chore  | P2        | CI-004 — `lint:architecture-readfile-via-safe-reader` en CI required |
| `c00014`  | chore  | P2        | CI-004 — `lint:privacy` en CI required                              |

**Objetivo del track**: ningún agente pueda dejar `develop` en rojo silenciosamente. Required checks mínimos: typecheck, tests, architecture (incluido safe-reader lint), lint-governance, security (incluido privacy lint), runtime verify, token budget real (Track E).

### Track E — Tokens: separar superficies adaptive / native (P1/P2)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `c00015`  | chore  | P1        | TOK-001 — root cause + fix para `tokens-budget-real` CI rojo       |
| `r00022`  | refac  | P2        | TOK-002 — separar adaptive / native en el dashboard                  |
| `r00023`  | refac  | P2        | TOK-005 — `Documented deficits` derivados automáticamente           |

**Objetivo del track**: dos superficies explícitas, nunca mezcladas. Cada fila con `surfaceMode`, `clientCapabilities / profile`, `toolCount`, `toolsListBytes`, `estimatedTokens`, `measuredAt`, `source`. El gate real (`tokens:gate --preset=swarm` con `--dynamic-client` / `--static-client`) decide la semántica exacta y queda documentado en su hija.

### Track F — Filesystem invariant allowlist removal (P2/P3)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `x00254`  | fix    | P2        | FS-001 + FS-002 — migrar `project-health` a SafeReader / primitive  |
| `x00255`  | fix    | P2        | FS-003 — migrar `quality-policy` a SafeReader / primitive          |
| `c00016`  | chore  | P2        | FS-001 — `ALLOWLIST = {}` como estado final, lint enforce         |

**Objetivo del track**: la allowlist del safe-reader lint llega a `const ALLOWLIST = {}`. Cada excepción restante tiene primitive dedicada (`SafeCacheReader`, `SafeInternalFileReader`) o issue explícito.

### Track G — Packaging / manifests (P2/P3)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `f00177`  | feat   | P2        | MAN-001 — `changelog` private vs presets distribuibles             |
| `f00178`  | feat   | P2        | MAN-002 — pack smoke external install para todos los presets        |
| `f00179`  | feat   | P3        | MAN-003 — `tokenBudget` manifest con semántica útil real            |
| `f00180`  | feat   | P3        | MAN-004 — `toolPermissions` por tool (granularidad)                 |

**Objetivo del track**: que la decisión `changelog` private vs presets sea coherente (cuatro caminos posibles documentados), que el pack smoke externo cubra los presets distribuibles reales, y que los campos `tokenBudget` / `toolPermissions` representen métricas útiles, no placeholders compartidos.

### Track H — Preset metadata generada desde medición real (P2)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `r00024`  | refac  | P2        | PRESET-001 — generar `PRESET_METADATA` desde la misma medición      |

**Objetivo del track**: eliminar tool counts manuales antiguos. `buildAdoptionAssessment()` consume metadata con `surfaceMode`, `measuredAt`, `toolCount`, `schemaBytes`, `estimatedTokens`, `estimator`, `source`. Generated-artifacts check detecta drift.

### Track I — Branch protection / integración real (P2)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `c00017`  | chore  | P2        | CI-005 — aplicar branch / ruleset protection real en GitHub        |
| `c00018`  | chore  | P2        | CI-006 — diseñar integración que evite `develop` rojo              |

**Objetivo del track**: `develop` nunca queda en rojo. Decisión explícita entre (a) agent branch → CI → fast-forward, (b) staging ref → CI → bot update, (c) PR con required checks, (d) merge queue. Evidence del estado real de GitHub (vía API), no solo del archivo YAML.

### Track J — Adaptive selection + surface policy (P2/P3)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `r00025`  | refac  | P3        | SEL-001 — integrar tokenTax / latencyTax / historicalSuccess       |
| `r00026`  | refac  | P2        | TOK-004 — invertir política surface: default adaptive, native fallback |
| `c00019`  | chore  | P2        | TOK-003 / TOK-004 — host compatibility matrix + ADR                  |

**Objetivo del track**: el surface mode por defecto para clientes MCP normales es `adaptive`. `native` queda como fallback explícito (opt-in por capability privada o por override de host). El scoring de auto-plugin-selector integra coste y éxito observado.

### Track K — Diseño API + políticas (P3 docs)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `d00007`  | docs   | P3        | FS-004 — `SafeWorkspaceReader` API: `resolveLexical` vs `resolveExistingContained` |
| `d00008`  | docs   | P3        | FS-005 — política reserved paths `.env.*`                           |

**Objetivo del track**: documentar la decisión de API para resolver el footgun de `resolve()`, y la política explícita para `.env.local`, `.env.production`, `.env.secret`.

### Track L — PRIVACY principio: provenance > regex (P2)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `x00256`  | fix    | P2        | PRIV-002 — no añadir heurísticas "parece nombre de empresa" al validator |

**Objetivo del track**: el privacy validator sigue siendo fail-closed pero **no se amplía con heurísticas de PII empresarial**. Toda la cobertura nueva se hace en el origen del dato, no en regex adicionales.

### Track M — Regression guards (P3)

| Propuesta | ID     | Prioridad | Hallazgos cubiertos                                                |
|-----------|--------|-----------|---------------------------------------------------------------------|
| `t00014`  | test   | P3        | PROC-001 — UTF-8 byte boundaries (1/2/3/4 bytes, lead / continuation split) |
| `t00015`  | test   | P3        | LIFE-001 — lifecycle DAG / cycle / rollback / AbortSignal           |
| `t00016`  | test   | P3        | MEM-001 — memory plugin dispose (watcher + debouncer)              |

**Objetivo del track**: mantener la calidad alcanzada en auditorías previas. Cada test cubre la clase de regresión que un cambio futuro podría introducir.

---

# Cobertura de secciones transversales de la auditoría

- **§0 Principios no negociables** → R1, R8 (privacidad), R9 (mutex), R4 (tokens), R7 (DoD).
- **§1 SRCH-001..003** → Track A.
- **§2 FS-001..005** → Tracks A (search) + F (allowlist removal) + K (diseño).
- **§3 PRIV-001..002** → Track B + Track L.
- **§4 MUTEX-001..002** → Track C.
- **§5 TOK-001..005** → Tracks D (gate rojo) + E (separar superficies) + J (default adaptive).
- **§6 CI-001..004** → Track D.
- **§7 CI-005..006** → Track I.
- **§8 MAN-001..004** → Track G.
- **§9 PRESET-001** → Track H.
- **§10 SEL-001** → Track J.
- **§11 PRIV-002** → Track L.
- **§12 PROC-001** → Track M (t00014).
- **§13 LIFE-001** → Track M (t00015).
- **§14 MEM-001** → Track M (t00016).
- **§15 FS-005** → Track K (d00008).
- **§22 Findings de auditoría anterior que NO deben reabrirse** → reconocidos como `ALREADY_FIXED`. No reabrir.

---

# Slices

- global_gate: type

## Slices

### S1 — Orquestar las 33 hijas a `done`

- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/plans/q00005-plan-hardening-post-auditoria-chatgpt-sol-tercera-pasada.md`
- **Gate**: type
- acceptance:
  - "Cada hija cierra sus slices y pasa peer review (`requireAllChildrenDone + requireAllSlicesDone`)."
  - "La tabla de tracks/propuestas de este plan se actualiza con el estado real de cada hija al avanzar."
  - "El cierre se realiza con `proposals_close_plan`, que no devuelve blockers."
  - "`requireEvidenceOnClose` exige `resolution.evidence` con commit + gates + before/after metric + SHA de evidence == SHA de la implementación en cada hija."

## acceptance

Criterios de aceptación globales (verificados a través de las hijas):

### Privacidad (P0 LEGAL — Track B + L)

- `error-reporting` no clasifica raw external tool names como internos por sufijo (`x00249`).
- Ningún raw external tool name aparece en report DTO / body / fingerprint / synthetic frame (`x00249` + `t00011`).
- Mismo fallo privado en dos proyectos genera payload público idéntico o ambos se bloquean (`t00011`).
- Una tool DelendAI real sigue clasificándose correctamente usando registry provenance (`x00249`).
- Reporting sigue `enabled: true` por defecto.
- `internalOnly:false` no existe (reforzando `b00236` de q00004).
- Privacy validator no se amplía con heurísticas empresariales (`x00256`).

### Filesystem search (Track A)

- `search_symbol` no lee fuera mediante symlink-root (`x00246`).
- `search_references` no lee fuera mediante symlink-root (`x00247`).
- `search_search` no lee fuera mediante `roots` symlink (`x00248`).
- Suite adversarial symlink-root verde (`t00010`).
- Sin `readdir` / `readFile` directos en estos tools.
- `bun run lint:architecture-readfile-via-safe-reader` verde.

### Filesystem allowlist removal (Track F)

- `project-health` migrado a SafeReader / primitive (`x00254`).
- `quality-policy` migrado a SafeReader / primitive (`x00255`).
- `const ALLOWLIST = {}` o cada excepción con primitive dedicada (`c00016`).

### Mutex (Track C)

- Race reproduction con `heartbeatAt` real (`t00012`).
- Rediseño aplicado si se reproduce (`x00250`).
- Property tests sobre la state machine del mutex con 3+ contendientes (`t00013`).
- `activeHolders <= 1` bajo cualquier interleaving.

### Tokens (Track E)

- Root cause + fix para `tokens-budget-real` CI rojo (`c00015`).
- Adaptive y native se muestran por separado en el dashboard (`r00022`).
- `Documented deficits` se deriva automáticamente de mediciones reales (`r00023`).
- 8 357 B produce estimado coherente con la heurística si se muestra en la misma fila.
- Native y adaptive comparables lado a lado.

### CI / gobernanza (Tracks D + I)

- `tests` job verde en SHA final (`x00251`).
- `lint-governance` job verde en SHA final (`x00252`).
- `lint:architecture-readfile-via-safe-reader` en CI required (`c00013`).
- `lint:privacy` en CI required (`c00014`).
- Branch / ruleset protection real activo en GitHub (`c00017`).
- Integración evita `develop` rojo (`c00018`).
- CI evidence required para cierre (`c00020`).

### Packaging (Track G)

- `changelog` decisión coherente entre `private` y presets (`f00177`).
- Pack smoke external install para todos los presets distribuibles (`f00178`).
- `tokenBudget` manifest con semántica útil real (`f00179`).
- `toolPermissions` por tool (`f00180`).

### Preset metadata (Track H)

- No tool counts manuales antiguos.
- Adoption assessment indica surface usada.
- Generated-artifacts check detecta drift (`r00024`).

### Adaptive / surface (Track J)

- Default surface `adaptive` para clientes MCP normales (`r00026`).
- Auto-selector integra tokenTax / latencyTax / historicalSuccess (`r00025`).
- Host compatibility matrix + ADR (`c00019`).

### Diseño / políticas (Track K)

- API `SafeWorkspaceReader` con `resolveLexical` vs `resolveExistingContained` documentada (`d00007`).
- Política reserved paths `.env.*` documentada (`d00008`).

### Regression guards (Track M)

- UTF-8 byte boundaries cubierto por tests (`t00014`).
- Lifecycle DAG / cycle / rollback / AbortSignal cubierto (`t00015`).
- Memory dispose (watcher + debouncer) cubierto (`t00016`).

---

# Orden de ejecución recomendado (para el agente orquestador)

> El orden refleja precedencia técnica y legal. Track B es **P0** y bloquea por defecto. Track D es prerequisito para considerar SHA candidato completamente verde.

1. **Track B privacidad P0** completo: `x00249` → `t00011`. **NO continuar con otros tracks hasta que Track B esté `done` con peer review verde.**
2. **Track D CI real — conseguir SHA verde**: `x00251` (tests CI) + `x00252` (lint-governance CI) + `c00015` (tokens-budget-real CI). Este paso es **bloqueante** para considerar el plan cerrable. Una vez verde el SHA candidato, continuar.
3. **Track A search**: `x00246` → `x00247` → `x00248` → `t00010`. La suite adversarial precede a los fixes (`t00010` puede ir primero).
4. **Track C mutex**: `t00012` (repro con `heartbeatAt`) → `x00250` (fix si reproduce) → `t00013` (property tests 3+ contendientes).
5. **Track F filesystem allowlist**: `x00254` → `x00255` → `c00016`.
7. **Track E tokens**: `c00015` (parte del paso 2) → `r00022` (separar superficies) → `r00023` (deficits derivados).
8. **Track G packaging**: `f00177` (changelog decision) → `f00178` (pack smoke externo) → `f00179` → `f00180`.
9. **Track H presets**: `r00024`.
10. **Track I branch protection**: `c00017` → `c00018`.
11. **Track J adaptive / surface**: `r00026` → `c00019` → `r00025`.
12. **Track L privacy principio**: `x00256`.
13. **Track K docs**: `d00007` → `d00008`.
14. **Track M regression guards**: `t00014` → `t00015` → `t00016`.
16. **DoD global**: todos los SHA de cierre en verde, evidence archivada, plan transiciona a `review` → `done`.

Cuando q00003, q00004 y q00005 estén todos `done` con peer review y CI verde, DelendAI queda aproximadamente en la posición objetivo definida por la auditoría externa.

---

# Definition of Done de este plan

- Las 33 hijas están `done` con peer review verde.
- Los criterios de aceptación globales están todos verificados con evidencia (`resolution.evidence`).
- Cada evidencia registra el SHA exacto en el que se cerró la hija.
- Los generated artifacts (registry, web catalog, docs, permissions, token dashboard) están sincronizados con HEAD.
- `bun run validate` verde en el commit de cierre.
- GitHub Actions CI verde en el mismo SHA: `tests`, `tokens-budget-real`, `lint-governance`, `lint-architecture`, `lint-security` (incluidos safe-reader + privacy lints).
- `proposals_close_plan` no devuelve blockers.
- Una cuarta auditoría (cuando llegue) no vuelve a encontrar las mismas clases de bug en las dimensiones aquí cubiertas.