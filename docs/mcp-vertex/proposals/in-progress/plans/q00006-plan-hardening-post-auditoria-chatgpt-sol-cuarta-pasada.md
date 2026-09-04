---
id: q00006
title: "Plan hardening post-auditoría externa ChatGPT 5.6 Sol (CUARTA pasada sobre develop) — develop verde, commit-policy correcto, privacy-by-construction, boundaries, tokens, governance"
kind: plan
status: in-progress
type: plan
track: develop-audit-hardening-v4
date: 2026-08-25
date_iso: 2026-08-25
predecessor-plans:
    - q00003 # auditoría externa 2026-08-24 (43 hijas, in-progress)
    - q00004 # segunda pasada 2026-08-25 (28 hijas, review)
    - q00005 # tercera pasada 2026-08-25 (33 hijas, done)
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    lines: 1366
    size: 36K
    reviewer: ChatGPT-5.6-Sol (external, high reasoning)
    commit-audited: a89a68ba6e3029b458d515dc219ce403edb45c7c
related:
    # Predecesores inmediatos en privacy / filesystems / mutex / tokens / CI
    - q00003 # predecesor lejano (43 hijas in-progress)
    - q00004 # predecesor inmediato (28 hijas review)
    - q00005 # tercera pasada (33 hijas done)
    # Privacy / filesystem primitives previas a reutilizar
    - x00241 # SafeWorkspaceReader — primitive base (Track F)
    - x00245 # safeToolId registry — base privacy (Track D x00260/x00261)
    - x00244 # with-file-mutex rediseño — base concurrency (Track B)
    - b00236 # error-reporting internalOnly eliminado (privacy predecessor)
    - c00005 # token gate CI real — base Track E
    # Plugins críticos tocados por la auditoría
    - f00158 # error-reporting
    - f00181 # commit-policy (recién integrado)
    - f00176 # surface-mode-by-client-capabilities
    - f00169 # impact-analysis + tests-for-change
contains:
    proposals:
        # ─── Track A — Integridad de develop / gobernanza (P0) ─────────────────
        - { id: c00130, kind: chore, required: true, priority: P0, track: governance }
        - { id: c00131, kind: chore, required: true, priority: P0, track: governance }
        - { id: c00132, kind: chore, required: true, priority: P0, track: governance }
        - { id: c00133, kind: chore, required: true, priority: P0, track: governance }
        - { id: x00257, kind: fix, required: true, priority: P0, track: governance }
        - { id: x00258, kind: fix, required: true, priority: P0, track: governance }
        - { id: v00125, kind: verification, required: true, priority: P0, track: governance }

        # ─── Track B — commit-policy correctness (P0/P1) ──────────────────────
        - { id: x00259, kind: fix, required: true, priority: P0, track: commit-policy }
        - { id: x00260, kind: fix, required: true, priority: P0, track: commit-policy }
        - { id: x00261, kind: fix, required: true, priority: P0, track: commit-policy }
        - { id: x00262, kind: fix, required: true, priority: P0, track: commit-policy }
        - { id: x00263, kind: fix, required: true, priority: P0, track: commit-policy }
        - { id: x00264, kind: fix, required: true, priority: P1, track: commit-policy }
        - { id: x00265, kind: fix, required: true, priority: P1, track: commit-policy }
        - { id: x00266, kind: fix, required: true, priority: P1, track: commit-policy }
        - { id: x00267, kind: fix, required: true, priority: P1, track: commit-policy }
        - { id: f00182, kind: feat, required: true, priority: P1, track: commit-policy }
        - { id: f00183, kind: feat, required: true, priority: P1, track: commit-policy }
        - { id: t00017, kind: test, required: true, priority: P0, track: commit-policy }
        - { id: t00018, kind: test, required: true, priority: P0, track: commit-policy }
        - { id: t00019, kind: test, required: true, priority: P1, track: commit-policy }
        - { id: t00020, kind: test, required: true, priority: P1, track: commit-policy }
        - { id: t00021, kind: test, required: true, priority: P1, track: commit-policy }

        # ─── Track C — Arquitectura y boundaries (P1) ─────────────────────────
        - { id: r00027, kind: refactor, required: true, priority: P1, track: architecture }
        - { id: r00028, kind: refactor, required: true, priority: P1, track: architecture }
        - { id: r00029, kind: refactor, required: true, priority: P1, track: architecture }
        - { id: r00030, kind: refactor, required: true, priority: P1, track: architecture }
        - { id: b00237, kind: breaking, required: true, priority: P1, track: architecture }

        # ─── Track D — Lifecycle & plugin states (P1) ─────────────────────────
        - { id: f00184, kind: feat, required: true, priority: P1, track: lifecycle }
        - { id: f00185, kind: feat, required: true, priority: P1, track: lifecycle }
        - { id: c00134, kind: chore, required: true, priority: P2, track: lifecycle }

        # ─── Track E — Token efficiency & central budgets (P1) ───────────────
        - { id: r00031, kind: refactor, required: true, priority: P1, track: tokens }
        - { id: r00032, kind: refactor, required: true, priority: P1, track: tokens }
        - { id: f00186, kind: feat, required: true, priority: P1, track: tokens }
        - { id: f00187, kind: feat, required: true, priority: P1, track: tokens }
        - { id: c00135, kind: chore, required: true, priority: P1, track: tokens }
        - { id: c00136, kind: chore, required: true, priority: P1, track: tokens }

        # ─── Track F — Security capabilities (P0/P1) ─────────────────────────
        - { id: f00188, kind: feat, required: true, priority: P0, track: security }
        - { id: f00189, kind: feat, required: true, priority: P1, track: security }
        - { id: c00137, kind: chore, required: true, priority: P1, track: security }
        - { id: d00009, kind: docs, required: true, priority: P2, track: security }

        # ─── Track G — CI scalability (P1) ────────────────────────────────────
        - { id: c00138, kind: chore, required: true, priority: P1, track: ci }
        - { id: c00139, kind: chore, required: true, priority: P1, track: ci }
        - { id: x00268, kind: fix, required: true, priority: P1, track: ci }
        - { id: v00126, kind: verification, required: true, priority: P1, track: ci }

        # ─── Track H — Docs drift / AGENT.md / code-map (P1) ─────────────────
        - { id: c00140, kind: chore, required: true, priority: P1, track: docs }
        - { id: c00141, kind: chore, required: true, priority: P1, track: docs }
        - { id: f00190, kind: feat, required: true, priority: P2, track: docs }
        - { id: d00010, kind: docs, required: true, priority: P2, track: docs }
        - { id: d00011, kind: docs, required: true, priority: P2, track: docs }

        # ─── Track I — CLI / mcpv doctor / web (P1) ──────────────────────────
        - { id: f00191, kind: feat, required: true, priority: P1, track: cli }
        - { id: c00142, kind: chore, required: true, priority: P1, track: cli }

        # ─── Track J — VSCode Agent Timeline + explainability (P2) ───────────
        - { id: f00192, kind: feat, required: true, priority: P2, track: vscode }

        # ─── Track K — External MCPs + capability versioning (P2) ────────────
        - { id: f00193, kind: feat, required: true, priority: P2, track: external-mcps }
        - { id: f00194, kind: feat, required: true, priority: P2, track: external-mcps }

        # ─── Track L — Cost-aware routing & model-aware presets (P2) ─────────
        - { id: f00195, kind: feat, required: true, priority: P2, track: routing }
        - { id: f00196, kind: feat, required: true, priority: P2, track: routing }
        - { id: f00197, kind: feat, required: true, priority: P2, track: memory }

        # ─── Track M — Envelopes + structuredContent rule + KPIs (P2) ────────
        - { id: r00033, kind: refactor, required: true, priority: P2, track: contracts }
        - { id: f00198, kind: feat, required: true, priority: P2, track: observability }
        - { id: f00199, kind: feat, required: true, priority: P2, track: observability }

        # ─── Track N — API stability + lazy loading + idempotency (P2) ───────
        - { id: b00238, kind: breaking, required: true, priority: P2, track: architecture }
        - { id: f00200, kind: feat, required: true, priority: P2, track: architecture }
        - { id: c00143, kind: chore, required: true, priority: P2, track: architecture }

        # ─── Track O — Workflow transactions (P3) ────────────────────────────
        - { id: f00201, kind: feat, required: true, priority: P3, track: transactions }

closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
    requireEvidenceOnClose: true
    requireDevelopGreen: true
globalGate: type
project-rules:
    privacy-inviolable: true
    privacy-by-construction: true
    fail-closed-on-uncertainty: true
    synthetic-examples-only: true
    no-telemetry-of-user-data: true
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
    no-proposal-id-comments-in-source: true
---

# q00006 — Plan hardening post-auditoría externa ChatGPT 5.6 Sol (CUARTA pasada)

## Goal

Orquestar la conversión de la **cuarta auditoría externa** de `develop`
(`docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md`,
SHA-256 `2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a`,
1366 líneas / 36 KB, HEAD auditado `a89a68ba6e3029b458d515dc219ce403edb45c7c`)
en trabajo trazable, verificable y cerrable.

Este plan agrupa **66 propuestas hijas** distribuidas en **15 tracks**
(A governance, B commit-policy, C architecture, D lifecycle, E tokens,
F security, G CI, H docs, I CLI, J VSCode, K external MCPs, L routing,
M contracts, N API stability, O transactions) y define las reglas de
proyecto que **todas** las hijas deben respetar obligatoriamente.

**Predecesores**:

| Plan     | Pasada                                  | Estado      | Notas                           |
| -------- | --------------------------------------- | ----------- | ------------------------------- |
| `q00003` | 2026-08-24 (43 hijas)                   | in-progress | auditoría externa original      |
| `q00004` | 2026-08-25 segunda pasada (28 hijas)    | review      | privacy/filesystem/mutex        |
| `q00005` | 2026-08-25 tercera pasada (33 hijas)    | done        | universalización de invariantes |
| `q00006` | **2026-08-25 cuarta pasada (66 hijas)** | **ready**   | **ESTE PLAN**                   |

Este plan **NO duplica** trabajo previo: las hijas de `q00003`/`q00004`/`q00005`
que sigan abiertas continúan ahí. Este plan cubre hallazgos nuevos de la
cuarta pasada (muchos referidos al recién integrado `commit-policy`) o
profundizaciones del mismo dominio donde el código actual demuestra
regresión.

### Naturaleza de este plan

**El plan no produce código por sí mismo**: es un **orquestador**. El
trabajo real lo entregan las 66 hijas, y el plan **no puede cerrarse**
(`done`) hasta que:

1. Cada hija cierre sus slices y pase peer review
   (`requireAllChildrenDone + requireAllSlicesDone`).
2. La tabla de tracks/propuestas al final de este documento refleje el
   estado real.
3. `proposals_close_plan` no devuelva blockers.
4. Los criterios de aceptación globales (sección **Reglas R1–R9**) estén
   todos verificados con evidencia en el SHA de cierre.
5. `develop` esté **verde** y **protegido** al cierre
   (`requireDevelopGreen`).

## why

La auditoría externa detecta que **la velocidad de creación de features
ha superado a la de consolidación de invariantes** con foco en el
recién integrado `commit-policy`. Las clases de bug identificadas son:

1. **P0 governance** — `develop` no está protegido, no se ejecuta
   `force-with-lease` correctamente contra ramas protegidas, no hay
   quality gate real que bloquee merges rojos.
2. **P0 commit-policy** — `buildScopedMessage` reescribe `fix: x` como
   `feat(f00181): x`; el slice listener detecta eventos y los descarta;
   `proposalId`/`sliceId` se exponen pero se ignoran; `sliceScoping=true`
   resulta en `files: []` y por tanto en "stage whatever is already
   staged" — exactamente el tipo de bug cross-agent contamination que
   estamos viendo en producción.
3. **P1 architecture** — `@delendai/core` crece hacia God Package;
   `@delendai/client` arrastra toda `core/public` por un barrel
   transitivo.
4. **P1 token economy** — `proposals` y `orchestrator-runner` son los
   hotspots (`≈51.834 + ≈43.805 bytes`); no hay `TokenBudgetRegistry`
   unificado; la heurística "descriptions" es equivocada (el coste está
   en schemas).
5. **P1 security** — el `IMcpPluginContext` actual es un God Context;
   no hay capability-based enforcement real; `dryRun` no es
   transversal.
6. **P1 CI** — `set -euo pipefail` con command substitution que falla
   puede esconder el output del job de diagnóstico.
7. **P1 docs/AGENT.md** — los datos cuantitativos (48 vs 50 plugins)
   están stale; los comentarios `// f00087 S2` contaminan el source
   para coding agents.
8. **P2 product** — external MCPs como plano de control, agent timeline,
   explainability, idempotency keys, workflows compensables, lazy
   loading real, event bus tipado.

La prioridad es:

1. **Cerrar la frontera de privacidad por construcción** (P0 — heredada
   de `q00004`/`q00005`, mantenida como R1 en este plan).
2. **Hacer verde y proteger `develop`** (Track A).
3. **Reparar `commit-policy` end-to-end** (Track B — 17 hijas).
4. **Estabilizar boundaries / lifecycle / capabilities** (Tracks C, D,
   F).
5. **Reducir coste de tokens en hotspots** (Track E).
6. **Escalar CI** (Track G).
7. **Limpiar docs y AGENT.md** (Track H).
8. **Diferenciar producto** (Tracks I–O).

Sin añadir features nuevas (excepto donde la auditoría las pide
explícitamente para resolver un bug).

## non-goals

- **No desactivar `error-reporting` por defecto.** La decisión de
  producto es default-on. La privacidad se garantiza por
  construcción, no por opt-out.
- **No recopilar telemetría del proyecto, del usuario, de su empresa,
  de sus rutas, de sus archivos, de sus secretos ni de terceros.** Esto
  se re-enfatiza como R1.4–R1.6 (heredado de `q00004`/`q00005`).
- **No subir automáticamente presupuestos de tokens.** Si un preset rompe
  su hard budget, se reduce el coste primero.
- **No crear más plugins primero.** Hay catálogo suficiente.
- **No dividir `packages/core` en runtime/sdk/authoring de golpe.** Se
  hace con un refactor incremental (Track C).
- **No fusionar arbitrariamente tools solo por ahorrar schemas.**
  Reducir repetición de envelopes sí; sacrificar safety no.
- **No reintroducir `internalOnly:false` como escape hatch** en
  error-reporting (cubierto por `b00236` de `q00004`; este plan no lo
  reabre).
- **No marcar `PROBABLE` como bug confirmado sin reproducción.** Los
  hallazgos marcados como BUG PROBABLE en la auditoría requieren un test
  que los reproduzca antes de marcarlos como DONE.
- **No cerrar una proposal `done` con CI rojo en su SHA de evidence.**
- **No dejar `commit-policy` activado por defecto** mientras
  `x00259`–`x00266` no estén todas DONE — el auto-commit puede producir
  cross-agent contamination (AUD-CP-005).
- **No exponer tool names externos ni nombres de dominio de negocio**
  en issues públicos, logs, telemetry o reportar de ningún tipo
  (R1.1, R1.5).
- **No añadir un mega-tool con `action: string` libre** para reducir
  coste de proposals.

---

# Reglas de proyecto obligatorias para todas las hijas (R1–R9)

Estas reglas son **invariantes de producto** y deben respetarse en cada
hija. Si una hija las viola, debe declarar la excepción explícitamente
en `non-goals` y justificar el motivo. Las reglas base vienen de
`docs/mcp-vertex/AGENT-BOOTSTRAP.md §6`; este plan las re-enfatiza y
**endurece** porque las hijas nuevas tienen alta densidad de cambios
cross-cutting.

> **Las reglas R1 (privacidad) son no negociables y prevalecen sobre
> cualquier otra consideración, incluyendo rendimiento,DX o backlog
> velocity.** Si una optimización de tokens obliga a exponer
> metadatos identificables del usuario, esa optimización se rechaza.

### R1 — Privacidad por construcción (P0 / LEGAL — máximo énfasis)

> **Esta es la regla más importante del proyecto, sin excepciones.**

- **R1.1 — Nunca** publicar nombres de tools registradas por el host,
  paths, repo, branch, args, outputs, source code, URLs privadas,
  tokens, emails, nombres internos de archivos sensibles, ni nombres de
  tools externas que puedan revelar dominio de negocio (clases C y D de
  la auditoría §30).
- **R1.2 — Privacidad por construcción**, no por redacción. La frontera
  está en los tipos (`SafeScalar`, `ISafeToolIdentity`, etc.) y en el
  flujo del reporter, no en `redactSecrets()` aplicado al final.
- **R1.3 — Fail-closed ante la duda.** Si el validator duda → **NO SE
  ENVÍA**. Se registra localmente `report blocked by privacy validator:
  <reason code>`.
- **R1.4 — Synthetic examples only.** No "redactar datos reales" para
  hacer ejemplos. Construir desde cero con dominios `example.invalid`,
  IDs `demo-123`, temas bakery/books/pets/planets.
- **R1.5 — Propiedad fuerte de privacidad**: dos proyectos distintos
  con el mismo bug Vertex deben producir el mismo issue público, salvo
  metadata segura (versión, package id, error code, runtime family,
  OS family).
- **R1.6 — Reporter no acepta `toolName` arbitrario**. Solo
  `ISafeToolIdentity` resuelto vía registry metadata.
- **R1.7 — `internalOnly:false` no existe** (reforzando `b00236` de
  `q00004`).
- **R1.8 — Detección de tool LLM debe basarse en provenance, no en
  heurística textual.** La registry `IToolIdentityRegistry` es la única
  fuente de verdad.
- **R1.9 — No-telemetría-del-usuario** (nueva, endurecimiento
  específico de este plan). Ningún flujo runtime — log, métrica, audit,
  report, profiler — debe enviar a un sink externo datos del usuario,
  su empresa, su repo, sus rutas, sus secretos, sus tools externas o
  cualquier metadato que pueda revelar dominio de negocio.
  Esto incluye telemetry agregada: agregaciones que cruzan
  workspaces/proyectos siguen siendo leak.
- **R1.10 — Sin SDK/plantillas que publiquen datos reales.** Ningún
  ejemplo, fixture, doc, screenshot o template puede contener nombres,
  paths, IDs o snippets del usuario real. Solo datos sintéticos
  (R1.4) o domains `example.*`.

### R2 — Code quality (Clean Code + SOLID + reuse)

Reflejado en `AGENT-BOOTSTRAP.md §6`. Cada hija debe respetarlo:

- **R2.1 — SOLID** (SRP, OCP, LSP, ISP, DIP) por defecto, sin
  recordatorio. Interfaces estrechas, registries en lugar de `switch`
  largos, dependency injection.
- **R2.2 — Clean Code**: nombres intention-revealing, funciones
  pequeñas y de un solo propósito, comentarios solo cuando explican
  *por qué* (no *qué*), sin errores tragados, sin código muerto, sin
  magic numbers, sin ramas comentadas.
- **R2.3 — Reusable code**: helpers compartidos antes que duplicación;
  utilities reusables en `packages/core/src/lib/util/` o
  `apps/shared/src/`; sin copy-paste doloroso entre plugins.
- **R2.4 — Best practices**: tests para lógica no trivial, validación
  en bordes I/O, bajo acoplamiento, alta cohesión, strict types,
  dependencias declaradas, errores tipados.

Excepciones aceptables únicamente si: (a) el usuario pide relajación
explícita, o (b) las instrucciones vinculantes del propio proyecto lo
imponen. Si una excepción aplica, declararla en `non-goals` con motivo.

### R3 — Mantenibilidad de carpetas / archivos / naming

- **R3.1 — Coherencia de naming** con el resto del repo. Kebab-case
  para archivos `.md` de propuestas; `<prefijo><NNNNN>-<título-kebab>.md`.
- **R3.2 — Una sola fuente de verdad** para datos machine-readable
  (plugin id, summary, permissions, presets, version, maturity, token
  budget). Lo manual es solo editorial.
- **R3.3 — Naming architecture estable**: los plugins, services,
  contracts, helpers, tests siguen la misma jerarquía ya existente. No
  crear nuevas formas a menos que la propuesta justifique el cambio.
- **R3.4 — Documentación actualizada** en cada cambio de superficie
  pública (tool list, output schema, permissions). El catálogo web se
  regenera desde manifests; las páginas
  `apps/web/src/data/pages/...` no mantienen listas de plugins a mano.
- **R3.5 — Sin comentarios `// fNNNNN SX` en código fuente** (nueva —
  endurecimiento). La trazabilidad vive en git, proposal graph,
  generated provenance. Las APIs y nombres de variables son atemporales.

### R4 — Tokens son constraints, no números a subir

- **R4.1** — Nunca se sube un presupuesto para hacer pasar un test. Si
  un preset rompe su hard budget, se reduce el coste primero.
- **R4.2** — Toda propuesta que añada tools o schemas debe medir
  `staticBytes` antes / después.
- **R4.3** — El dashboard de tokens se regenera automáticamente;
  `tokens:dashboard:check` debe pasar.
- **R4.4** — Las superficies `adaptive` y `native` se muestran
  **separadas**. No mezclar bytes de una con tokens estimados de otra.
- **R4.5** — `Documented deficits` refleja automáticamente breaches
  reales detectados. Si hay hard breach, no puede aparecer `none`.
- **R4.6** — Toda propuesta de Track E debe aportar antes/después con
  tabla medible.

### R5 — Invariantes como APIs / lints, no tribal knowledge

- **R5.1** — Si dos plugins pueden necesitar la misma garantía
  (filesystem containment, network allowlist, process safety, privacy
  validator), esa garantía se convierte en API pública del core.
- **R5.2** — Si una clase de bug puede reintroducirse (p. ej.
  `readFile(resolve(workspaceRootAbs, userPath))`,
  `buildScopedMessage` perdiendo type), se añade un lint arquitectónico
  que lo bloquee en CI.
- **R5.3** — Los lints viven bajo `tools/scripts/lint/` y son ejecutados
  por `bun run validate`. Cada lint tiene un test de sí mismo.

### R6 — Cerrar con evidencia

Cada hija debe cerrar con `resolution.evidence` que incluya al menos:

- commit hash;
- gates ejecutados (typecheck, lint, tests, security, runtime verify,
  token budget);
- before/after metric cuando aplique;
- link al test adversario cuando aplique;
- para hallazgos BUG PROBABLE: test reproductor previo al fix;
- para cambios de schema/surface: tabla `staticBytes` antes/después.

### R7 — Tests antes que código de producción

- **R7.1** — Para cada bug, **primero el test reproductor**, después
  el fix. La propuesta debe incluir el commit del test rojo y el commit
  del fix que lo pone verde.
- **R7.2** — Property-based tests para parsers de Conventional
  Commits, normalizadores de paths, validadores de privacy, etc.
- **R7.3** — Tests adversarios para capacidades de seguridad: probar
  que un plugin sin capability X no puede llamar a la API X aunque
  intente saltarse la inyección de dependencias.

### R8 — Privacidad también en tests y fixtures

- **R8.1** — Ningún test usa paths del host real, emails reales,
  nombres de proyectos reales. Solo dominios `example.*`, paths
  `/tmp/<uuid>` o `os.tmpdir()` + `randomUUID()`, fixtures sintéticas.
- **R8.2** — Los tests que reproducen bugs no copian payloads reales
  del usuario; construyen payloads sintéticos equivalentes.
- **R8.3** — `bun run validate` y CI deben incluir un lint que detecte
  paths sospechosos en fixtures/tests
  (`tools/scripts/lint/no-host-paths-in-tests.script.ts` — heredado
  del trabajo previo).

### R9 — develop verde y protegido como invariant

- **R9.1** — Ningún merge a `develop` puede ocurrir con CI rojo en su
  merge-result. El quality gate es required.
- **R9.2** — `develop` está protegida en GitHub: required status
  checks, no force push, no push directo.
- **R9.3** — El cierre de cualquier hija de este plan que toque CI /
  governance debe aportar como evidencia el estado real de
  `develop` (commit + estado de GitHub Actions), no solo el local.

---

# Tracks y propuesta de hijas

A continuación, cada track tiene:

- **audit refs**: lista de IDs de la auditoría que origina el track.
- **goal / scope / non-goals**: alcance del track.
- **hijas**: tabla resumen con `id`, `kind`, `priority`, `title`.
- **detalle**: especificación muy detallada de cada hija.

> **Convención de ID** — Para este plan reservamos rangos:
>
> | Prefijo | Rango | Notas |
> | --- | --- | --- |
> | `x00257`–`x00268` | fixes (12) | bug confirmado o probable |
> | `f00182`–`f00201` | features (20) | capacidad nueva justificada |
> | `r00027`–`r00033` | refactors (7) | cambio arquitectónico |
> | `c00130`–`c00143` | chores (14) | infraestructura, configs, deps |
> | `t00017`–`t00021` | tests (5) | regression / property / adversarial |
> | `d00009`–`d00011` | docs (3) | ADRs, manuales, capability matrix |
> | `b00237`–`b00238` | breaking (2) | cambios incompatibles con deprecation plan |
> | `v00125`–`v00126` | verification (2) | gates reales sobre estado actual |
>
> Los IDs numéricos pueden desplazarse si el agente detecta colisiones
> con nuevas proposals abiertas durante la ejecución. Mantener siempre
> la **gama** por track.

---

## Slices

This plan orchestrates 15 tracks containing 65 daughter proposals. Each track's daughters are the work items; this plan itself does not introduce additional code slices — it is a coordination layer over the daughters. Closure of the plan requires each daughter to be closed (`done`) with peer review.

### S1 — Track-by-track execution

- **Status**: in-progress
- **Files**: (this plan; the 65 daughter proposals; per-track daughter `.md` files)
- **Gate**: type
- acceptance:
  - "All 65 daughters are `done` with peer review."
  - "`proposals_close_plan q00006` returns no blockers."
  - "`develop` is green and protected."

Each `### Track X` subsection below groups its daughters and is closed when ALL daughters in that track are done with peer review and the track-specific acceptance criteria are met.


### Track A — Integridad de `develop` / gobernanza (P0)

> **Audit refs:** AUD-P0-001, AUD-P0-002, AUD-P0-003 (y efecto en cascada
> sobre el resto del snapshot rojo).
> **Goal:** dejar `develop` verde y protegido antes de cerrar cualquier
> otra hija del plan.
> **Scope:** GitHub branch protection + commit-policy config + CI gates
> reales + drift detection para artifacts/manifests/docs.
> **Non-goals:** no añadir features; no desactivar quality gates; no
> debilitar privacy R1.x.

### A.0 — Tabla de hijas

| ID       | Kind         | Priority | Title                                                                             |
| -------- | ------------ | -------- | --------------------------------------------------------------------------------- |
| `c00130` | chore        | P0       | Proteger `develop` en GitHub: required status checks + no force-push              |
| `c00131` | chore        | P0       | Añadir `develop` a `commit-policy.protectedBranches` por defecto                  |
| `c00132` | chore        | P0       | Required quality gate pre-merge: jobs reales, no decorativos                      |
| `c00133` | chore        | P0       | Drift CI: git diff --exit-code para artifacts / manifests / docs generadas        |
| `x00257` | fix          | P0       | Eliminar `force-with-lease` para ramas protegidas (defense in depth)              |
| `x00258` | fix          | P0       | Bloquear push directo a `develop` en `commit-policy` driver                       |
| `v00125` | verification | P0       | Verificar estado real de `develop` (verde + protegida) antes de cerrar este track |

### A.1 — Detalle por hija

#### `c00130` — Proteger `develop` en GitHub: required status checks + no force-push

- **Audit refs:** AUD-P0-001.
- **Goal:** aplicar branch protection real en GitHub para `develop` y
  `main`, con required status checks (quality gate, tests, tokens,
  governance).
- **Scope:** cambios en `.github/branch-protection.yml` (generado) +
  documento de instrucciones operativas para un humano que aplique los
  cambios en la UI de GitHub (porque la API admin:repo requiere
  privilegios no asumibles por CI).
- **Non-goals:** no automatizar la aplicación de la policy en GitHub
  (requiere OAuth admin scope); sí dejar evidencia del estado real.
- **Files (expected):**
  - `.github/branch-protection.yml` (declarativo)
  - `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` (instrucciones)
  - `tools/scripts/ci/verify-branch-protection.script.ts` (verificación)
- **Behavior current:** `develop` no protegida; el plugin `commit-policy`
  no la lista en `protectedBranches`; GitHub Actions jobs pueden pasar
  decorativamente.
- **Behavior desired:**
  - `main` y `develop` protegidas en GitHub con
    `required_status_checks` (quality gate, tests, tokens, governance,
    security).
  - `enforce_admins: true`, `required_linear_history: true`,
    `allow_force_pushes: false`, `allow_deletions: false`.
  - Documento operativo versionado para que el usuario aplique los
    cambios vía UI/API.
  - Script `verify-branch-protection` que falle si la policy difiere.
- **Tests:** `tools/scripts/ci/verify-branch-protection.spec.ts` con
  fixtures de GitHub API response.
- **Acceptance:**
  - Script pasa contra la API real (o contra un mock que represente
    la policy declarada).
  - Documento versionado en `docs/mcp-vertex/`.
  - Evidence en `resolution.evidence`: SHA + estado real de GitHub.
- **Dependencies:** ninguna; bloquea otras hijas P0.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** ninguno.
- **Rollback:** revertir el documento y `.github/branch-protection.yml`.
- **Risk:** GitHub puede no devolver la policy actual por permisos; usar
  el endpoint público `/repos/:owner/:repo/branches/:branch/protection`.

#### `c00131` — Añadir `develop` a `commit-policy.protectedBranches` por defecto

- **Audit refs:** AUD-P0-001 (efecto).
- **Goal:** que la lista por defecto de ramas protegidas del plugin
  `commit-policy` incluya `develop`, no solo `main`/`master`.
- **Scope:** `plugins/commit-policy/src/lib/config/defaults.ts` (o
  equivalente) + tests.
- **Non-goals:** no eliminar la posibilidad de override por
  configuración del usuario.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/config/defaults.ts`
  - `plugins/commit-policy/tests/src/lib/config/defaults.spec.ts`
- **Behavior current:** `DEFAULT_PROTECTED_BRANCHES = ['main', 'master']`.
- **Behavior desired:** `DEFAULT_PROTECTED_BRANCHES = ['main', 'master',
  'develop']` con tests que verifiquen la lista exacta.
- **Tests:**
  - Defaults contiene `develop`.
  - Override por config del usuario sigue funcionando.
- **Acceptance:** tests verdes; `commit-policy` rechaza push directo a
  `develop` con `--force-with-lease`.
- **Dependencies:** `c00130` (documentación operativa).
- **Tokens impact:** ninguno.
- **Security impact:** positivo (reduce superficie de rewrite).
- **Compatibility:** aditiva.
- **Rollback:** revert del cambio en `defaults.ts`.
- **Risk:** un override del usuario podría silenciar `develop`; añadir
  warning explícito en validación.

#### `c00132` — Required quality gate pre-merge: jobs reales, no decorativos

- **Audit refs:** AUD-P0-002.
- **Goal:** que el workflow de CI tenga un job `quality-gate` que se
  ejecute **obligatoriamente** en `merge_group`/`merge_queue` y que
  bloquee el merge si está rojo. Hoy la auditoría detecta que los
  required checks pasan decorativamente sin haber validado el estado
  integrado.
- **Scope:** workflow de GitHub Actions + script de validación.
- **Non-goals:** no rehacer el workflow; solo endurecer el gate.
- **Files (expected):**
  - `.github/workflows/quality-gate.yml` (nuevo o extendido)
  - `tools/scripts/ci/quality-gate.script.ts`
- **Behavior current:** quality gate es advisory; puede haber merge a
  `develop` con quality gate rojo.
- **Behavior desired:**
  - Job `quality-gate` ejecuta `bun run validate` + los lints
    arquitectónicos + `tokens:dashboard:check` + `tokens:preset-gate`.
  - Failure del job bloquea el merge.
  - Required status check declarado en branch protection (ver `c00130`).
- **Tests:** script ejecutable en local con `--dry-run`.
- **Acceptance:**
  - El job existe, se ejecuta, y la failure bloquea un PR de prueba.
  - Evidencia de un merge intentado y rechazado.
- **Dependencies:** `c00130`.
- **Tokens impact:** ninguno directo; consume CI minutes.
- **Security impact:** ninguno.
- **Compatibility:** ninguno.
- **Rollback:** desactivar el job (no recomendable).
- **Risk:** timeouts del job si la batería crece; tuning de
  `bun test --shard` o ejecución paralela.

#### `c00133` — Drift CI: git diff --exit-code para artifacts / manifests / docs generadas

- **Audit refs:** AUD-P0-003.
- **Goal:** introducir un job CI que ejecute el regenerador completo y
  falle con `git diff --exit-code` si hay drift entre source y artifacts.
- **Scope:** comando `gen:all` + job CI + tests.
- **Non-goals:** no versionar artifacts innecesarios; sí versionar los
  que aportan valor de review humana.
- **Files (expected):**
  - `tools/scripts/gen-all.script.ts`
  - `.github/workflows/drift.yml` (o extensión del existente)
- **Behavior current:** el dev puede olvidar regenerar; CI detecta
  drift pero tarde (post-merge).
- **Behavior desired:** `gen:all` es un único comando que regenera
  catálogo, manifests, capabilities matrix, AGENT.md, AGENTS.md,
  token dashboard, etc. CI falla con diff claro y accionable si hay
  drift en un PR.
- **Tests:** `tools/scripts/gen-all.spec.ts` con fixture repo vacío.
- **Acceptance:**
  - `gen:all` es idempotente (segunda ejecución no produce diff).
  - CI falla con diff legible ante drift.
  - Evidencia con un cambio de plugin y un PR que detecta drift.
- **Dependencies:** `c00132`.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** ninguno.
- **Rollback:** desactivar el job (no recomendable).
- **Risk:** generadores pesados pueden alargar CI; considerar pre-push
  local + CI rápido + nightly completo.

#### `x00257` — Eliminar `force-with-lease` para ramas protegidas (defense in depth)

- **Audit refs:** AUD-P0-001.
- **Goal:** aunque la policy local diga que `--force-with-lease` es
  aceptable, **nunca** se debe permitir contra una rama protegida
  (`main`, `master`, `develop`).
- **Scope:** `commit-policy` push driver.
- **Non-goals:** no eliminar `--force-with-lease` para worktrees
  efímeros (`agent/<name>`).
- **Files (expected):**
  - `plugins/commit-policy/src/lib/drivers/push.ts`
  - `plugins/commit-policy/tests/src/lib/drivers/push.spec.ts`
- **Behavior current:** push a rama protegida es rechazado solo si la
  rama está en `protectedBranches` **y** el modo es `force`. El modo
  `force-with-lease` pasa si la rama no está protegida.
- **Behavior desired:** push a `protectedBranches` se rechaza
  incondicionalmente, con un mensaje claro y reason code estable.
- **Tests:**
  - protected + force → refusal
  - protected + force-with-lease → refusal
  - protected + normal → refusal (ya pasaba)
  - no protected + force → ok
  - no protected + force-with-lease → ok
- **Acceptance:** todos los tests pasan; ningún branch de protection
  permite force.
- **Dependencies:** `c00131`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva (un usuario que intentaba force a develop
  ahora será rechazado; eso es el objetivo).
- **Rollback:** revert del cambio (no recomendable).
- **Risk:** falsos positivos si la policy se configura con
  `protectedBranches` amplias; documentar override explícito.

#### `x00258` — Bloquear push directo a `develop` en `commit-policy` driver

- **Audit refs:** AUD-P0-001.
- **Goal:** defense in depth — incluso si el usuario configura la
  policy para permitir force, el driver rechaza push directo a
  `develop` (debe pasar por PR).
- **Scope:** `commit-policy` push driver.
- **Non-goals:** no eliminar push a worktrees (`agent/<name>`).
- **Files (expected):**
  - `plugins/commit-policy/src/lib/drivers/push.ts`
  - `plugins/commit-policy/tests/src/lib/drivers/push.spec.ts`
- **Behavior current:** push a `develop` se permite si no está
  protegida.
- **Behavior desired:** push a `develop` se rechaza con reason
  `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED`.
- **Tests:**
  - `push('develop', 'main', ...)` → refusal
  - `push('develop', 'feature/x', ...)` → refusal
  - `push('agent/foo', 'main', ...)` → ok
- **Acceptance:** tests verdes; ningún push directo a `develop` desde
  `commit-policy` puede ocurrir.
- **Dependencies:** `x00257`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva.
- **Rollback:** revert del cambio.
- **Risk:** workflows legítimos rotos; documentar el nuevo contrato.

#### `v00125` — Verificar estado real de `develop` (verde + protegida) antes de cerrar este track

- **Audit refs:** AUD-P0-001, AUD-P0-002.
- **Goal:** evidencia medible (no afirmación) de que `develop` está
  verde en CI y protegida en GitHub.
- **Scope:** script ejecutable + dashboard entry.
- **Non-goals:** no almacenar credenciales de GitHub en el repo.
- **Files (expected):**
  - `tools/scripts/ci/verify-develop-health.script.ts`
  - `apps/web/src/data/...` (entry del dashboard)
- **Behavior current:** la auditoría no puede confirmar el estado
  real.
- **Behavior desired:** script devuelve:
  - estado de CI del último commit en `develop`
  - JSON de la policy de protection
  - lista de required status checks
  - exit code 0 si todo cumple; 1 si no.
- **Tests:** `tools/scripts/ci/verify-develop-health.spec.ts` con
  fixtures de GitHub API.
- **Acceptance:** script ejecutable; CI lo invoca en nightly; entry en
  dashboard.
- **Dependencies:** `c00130`, `c00132`.
- **Tokens impact:** ninguno.
- **Security impact:** bajo (el script solo lee).
- **Compatibility:** ninguno.
- **Rollback:** desactivar el script.
- **Risk:** GitHub API rate limit; cachear respuestas.

---

### Track B — commit-policy correctness (P0/P1)

> **Audit refs:** AUD-CP-001 a AUD-CP-012 (12 hallazgos).
> **Goal:** corregir el plugin `commit-policy` recién integrado
> (`f00181`) para que sea correcto, idempotente, multi-agent safe,
> lifecycle-clean y con push policy completa.
> **Scope:** `plugins/commit-policy/src/**` + tests.
> **Non-goals:** no reescribir el plugin desde cero; no eliminar el
> plugin. Sí desactivar el **trigger automático** mientras
> `x00259`–`x00266` no estén todas DONE (para evitar cross-agent
> contamination en producción).
> **Privacidad:** ningún cambio en este track expone datos del usuario;
> al contrario, el engine central con `eventId` y `idempotencyKey`
  reduce superficie de leak por reintentos.

### B.0 — Tabla de hijas

| ID       | Kind | Priority | Title                                                                                 |
| -------- | ---- | -------- | ------------------------------------------------------------------------------------- |
| `x00259` | fix  | P0       | `buildScopedMessage` debe preservar `type`, scope y `!`                               |
| `x00260` | fix  | P0       | Slice listener: conectar el evento al engine (no descartar)                           |
| `x00261` | fix  | P0       | Listener: devolver `dispose()` con `stop()` en el plugin                              |
| `x00262` | fix  | P0       | `commit_policy_run` con `proposalId`+`sliceId` debe seleccionar exactamente ese slice |
| `x00263` | fix  | P0       | `sliceScoping=true` debe stagear **exactamente** los archivos del slice               |
| `x00264` | fix  | P1       | Threshold: medir y stagear el mismo conjunto de dirty files                           |
| `x00265` | fix  | P1       | `requireConventional=true` debe rechazar mensajes no convencionales                   |
| `x00266` | fix  | P1       | Push policy engine: `onCommit`, `everyNCommits`, `everyNMinutes`                      |
| `f00182` | feat | P1       | `CommitPolicyEngine`: orquestador central de triggers                                 |
| `f00183` | feat | P1       | Idempotency keys para commits automáticos                                             |
| `t00017` | test | P0       | Conventional Commits parser: property-based + tabla de casos                          |
| `t00018` | test | P0       | Slice event staging: cross-agent safe (dos agentes dirty simultáneos)                 |
| `t00019` | test | P1       | Threshold staging: reproduce "predicate ≠ action"                                     |
| `t00020` | test | P1       | Plugin lifecycle: reload/dispose no duplica listeners                                 |
| `t00021` | test | P1       | Idempotency: replay del mismo eventId → un solo commit                                |

### B.1 — Detalle por hija

#### `x00259` — `buildScopedMessage` debe preservar `type`, scope y `!`

- **Audit refs:** AUD-CP-001.
- **Goal:** que la función reconstruya el header preservando `type`,
  `scope`, `!` y body.
- **Scope:** `plugins/commit-policy/src/lib/contracts/scope.ts` (o
  equivalente).
- **Non-goals:** no introducir tipos custom no soportados por
  conventional commits; sí mantener compatibilidad con prefijos custom
  ya en uso.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/contracts/scope.ts`
  - `plugins/commit-policy/src/lib/contracts/scope.spec.ts`
- **Behavior current:**
  ```
  fix: corrige carrera
  → feat(f00181): corrige carrera  # MAL
  ```
- **Behavior desired:**
  ```
  fix: corrige carrera         → fix(f00181): corrige carrera
  refactor!: cambia API        → refactor(f00181)!: cambia API
  fix(core): x                 → fix(core): x   # unchanged
  chore: x                     → chore(f00181): x
  xyz: x                       → xyz(f00181): x # custom
  ```
- **Tests:** `t00017` cubre la tabla completa + property-based.
- **Acceptance:**
  - Tabla de casos pasa.
  - Property-based test genera 1000 mensajes aleatorios y verifica
    invariante: `parse(rebuild(x)) === x`.
- **Dependencies:** ninguna.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** aditiva (mensajes antes rotos ahora correctos).
- **Rollback:** revert del cambio.
- **Risk:** semver bump de `commit-policy` puede ser necesario si el
  output anterior se consume fuera.

#### `x00260` — Slice listener: conectar el evento al engine (no descartar)

- **Audit refs:** AUD-CP-002.
- **Goal:** que el listener entregue los eventos detectados a
  `CommitPolicyEngine.handle(event)`, no que los marque como vistos y
  los descarte.
- **Scope:** `plugins/commit-policy/src/index.ts` + listener.
- **Non-goals:** no introducir event bus global todavía (eso es
  Track U); usar un callback inyectable ahora.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts`
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts`
- **Behavior current:** listener detecta evento, lo marca visto, lo
  descarta.
- **Behavior desired:** listener detecta evento, llama a `engine.handle`,
  recibe ack, marca visto **solo si** el engine confirma éxito. Si el
  engine falla, el evento se reintenta según policy.
- **Tests:**
  - Evento slice done → engine recibe el evento con `files`.
  - Engine falla → evento NO se marca visto.
  - Engine éxito → evento se marca visto una sola vez.
- **Acceptance:** tests verdes; ningún evento detectado sin acción
  correspondiente.
- **Dependencies:** `f00182` (engine).
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** interna.
- **Rollback:** revert.
- **Risk:** reintroducir el bug; tests adversarios son obligatorios.

#### `x00261` — Listener: devolver `dispose()` con `stop()` en el plugin

- **Audit refs:** AUD-CP-003.
- **Goal:** que `register()` retorne un `dispose()` que pare el
  listener y cualquier timer del plugin.
- **Scope:** `plugins/commit-policy/src/index.ts`.
- **Non-goals:** no añadir dispose para capabilities que no
  pertenecen al plugin.
- **Files (expected):**
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/tests/src/index.spec.ts`
- **Behavior current:** `listener.start()` se llama; no hay cleanup.
- **Behavior desired:**
  ```ts
  return {
    tools,
    knowledge,
    dispose() {
      listener.stop();
      intervalTimer?.stop();
      // ...cualquier handle del plugin
    },
  };
  ```
- **Tests:** `t00020` cubre reload/dispose.
- **Acceptance:** reload N veces deja exactamente un listener; dispose
  deja cero listeners activos.
- **Dependencies:** ninguna.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno (limpieza es hygiene).
- **Compatibility:** interna.
- **Rollback:** revert.
- **Risk:** ninguno.

#### `x00262` — `commit_policy_run` con `proposalId`+`sliceId` debe seleccionar exactamente ese slice

- **Audit refs:** AUD-CP-004.
- **Goal:** que el handler respete los argumentos; si no encuentra el
  slice exacto, refuse tipado.
- **Scope:** `commit_policy_run` handler.
- **Non-goals:** no permitir selección por defecto "primer slice
  elegible".
- **Files (expected):**
  - `plugins/commit-policy/src/lib/tools/run.ts`
  - `plugins/commit-policy/tests/src/lib/tools/run.spec.ts`
- **Behavior current:** `kind: "slice"` recorre snapshot y toma el
  primer slice elegible.
- **Behavior desired:**
  - `proposalId` y `sliceId` ambos presentes → selecciona ese slice
    exacto.
  - Si no existe → refusal tipado `SLICE_NOT_FOUND`.
  - Si solo uno está presente → refusal `INCOMPLETE_SELECTOR`.
  - Si ninguno está presente y `kind: "slice"` → refuse con
    `SELECTOR_REQUIRED` (rechaza el comportamiento "primer elegible").
- **Tests:**
  - Selector exacto → ese slice.
  - Selector inexistente → refusal.
  - Selector parcial → refusal.
  - Sin selector + kind=slice → refusal.
  - Sin selector + kind=manual → ok (no aplica).
- **Acceptance:** tests verdes; comportamiento determinista.
- **Dependencies:** ninguna.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** breaking para clientes que usaban el primer
  elegible por defecto (documentar en CHANGELOG).
- **Rollback:** revert (no recomendable).
- **Risk:** workflows existentes rotos; release notes claras.

#### `x00263` — `sliceScoping=true` debe stagear **exactamente** los archivos del slice

- **Audit refs:** AUD-CP-005.
- **Goal:** que el evento de slice lleve los archivos del slice y el
  driver los stagee explícitamente.
- **Scope:** `slice-listener.ts` + `commit-policy/src/lib/drivers/git.ts`.
- **Non-goals:** no aceptar `files: []` como "skipAdd".
- **Files (expected):**
  - `plugins/commit-policy/src/lib/triggers/slice-listener.ts`
  - `plugins/commit-policy/src/lib/drivers/git.ts`
  - `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts`
  - `plugins/commit-policy/tests/src/lib/drivers/git.spec.ts`
- **Behavior current:** contexto del slice = `files: []` → driver
  interpreta como `skipAdd: true` → stagea lo que ya esté staged
  (incluyendo trabajo de otros agentes).
- **Behavior desired:**
  - Listener emite evento con `files: SliceFiles` (lista exacta).
  - Driver stagea **solo** esa lista.
  - Si la lista está vacía → refusal `SLICE_HAS_NO_FILES` o
    `SKIP_STAGE_EXPLICIT` con opt-in del usuario (nunca default).
  - Verificación post-stage: `git diff --cached --name-only` ⊆
    `files`.
- **Tests:**
  - Slice con 3 archivos → stagea exactamente esos 3.
  - Staged ajenos preexistentes → no entran.
  - Slice sin archivos → refusal o skip explícito (configurable).
  - Dos agentes dirty simultáneos → cada uno stagea solo los suyos.
- **Acceptance:** `t00018` (cross-agent safe) pasa.
- **Dependencies:** `x00260`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo (reduce cross-agent contamination).
- **Compatibility:** breaking.
- **Rollback:** revert.
- **Risk:** si el slice se ha creado sin contexto de archivos (p. ej.
  propuestas históricas), se necesita migración o fallback explícito.

#### `x00264` — Threshold: medir y stagear el mismo conjunto de dirty files

- **Audit refs:** AUD-CP-006.
- **Goal:** que el trigger de threshold devuelva los dirty files y el
  engine los stagee.
- **Scope:** threshold trigger + engine.
- **Non-goals:** no añadir heurísticas avanzadas (eso es Track U con
  event bus).
- **Files (expected):**
  - `plugins/commit-policy/src/lib/triggers/threshold.ts`
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/tests/src/lib/triggers/threshold.spec.ts`
- **Behavior current:** threshold decide disparar → engine ejecuta con
  `files: []` → `skipAdd: true` → stagea nada o lo ajeno.
- **Behavior desired:**
  - Trigger retorna `{ kind: 'threshold', files: [...dirty] }`.
  - Engine stagea esos mismos paths.
  - Verificación post-stage: `git diff --cached --name-only` ⊆
    `files`.
- **Tests:**
  - threshold=3, 2 dirty → no event.
  - threshold=3, 3 dirty → event con esos 3.
  - threshold=3, 4 dirty → event con los 4 (o policy definida).
  - Staged ajenos no entran.
- **Acceptance:** `t00019` pasa.
- **Dependencies:** `f00182`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva.
- **Rollback:** revert.
- **Risk:** si el `git status` es lento, añadir debounce.

#### `x00265` — `requireConventional=true` debe rechazar mensajes no convencionales

- **Audit refs:** AUD-CP-007 (BUG PROBABLE).
- **Goal:** validar antes del commit.
- **Scope:** engine + Conventional Commits parser.
- **Non-goals:** no validar el body (solo el header).
- **Files (expected):**
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/contracts/conventional.ts`
  - `plugins/commit-policy/tests/src/lib/contracts/conventional.spec.ts`
- **Behavior current:** driver pasa el mensaje directamente sin
  validar.
- **Behavior desired:**
  - Si `requireConventional=true` y el header no parsea → refusal
    tipado `NON_CONVENTIONAL_MESSAGE` con razón específica.
  - Si `requireConventional=false` → warning en log, no refusal.
- **Tests:**
  - "hola" + requireConventional=true → refusal.
  - "hola" + requireConventional=false → warning, commit procede.
  - "feat: x" + requireConventional=true → ok.
- **Acceptance:** tests verdes; comportamiento tipado.
- **Dependencies:** `x00259`, `f00182`.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** aditiva (la policy ya estaba documentada).
- **Rollback:** revert.
- **Risk:** si la validation rechaza por whitespace, mensaje claro.

#### `x00266` — Push policy engine: `onCommit`, `everyNCommits`, `everyNMinutes`

- **Audit refs:** AUD-CP-008, AUD-CP-009.
- **Goal:** que `CommitPolicyEngine` orqueste push según las policies
  declaradas, con un scheduler único disposed.
- **Scope:** engine + scheduler.
- **Non-goals:** no añadir push paralelo.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/scheduler.ts`
  - `plugins/commit-policy/tests/src/lib/scheduler.spec.ts`
- **Behavior current:** no hay engine; push tiene su propio tool sin
  orquestación.
- **Behavior desired:**
  - `onCommit=true` → push por commit exitoso.
  - `everyNCommits=N` → push solo cuando el contador llega a N.
  - `everyNMinutes=N` → push programado en scheduler único, disposed
    al reload.
  - Combinaciones no duplican push.
  - Protected branch siempre prevalece (no push a `develop`/`main`).
- **Tests:**
  - onCommit=true → un push por commit.
  - everyNCommits=3 → push después del tercero, no antes.
  - everyNMinutes → scheduler ejecuta una vez, dispose lo para.
  - Combinación onCommit+everyNCommits → un push (no doble).
  - Protected → refusal.
- **Acceptance:** tests verdes.
- **Dependencies:** `f00182`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva.
- **Rollback:** revert.
- **Risk:** scheduler requiere lifecycle-clean (depende de `x00261`).

#### `x00267` — Branch protection policy unificada (commit + push)

- **Audit refs:** AUD-CP-009.
- **Goal:** que un commit manual, threshold o interval no pueda
  commitear directamente a una rama protegida.
- **Scope:** `plugins/commit-policy/src/lib/engine.ts`,
  `plugins/commit-policy/src/lib/drivers/git.ts`.
- **Non-goals:** no separar `commit.protectedBranches` y
  `push.protectedBranches` todavía (eso es P2).
- **Files (expected):**
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/contracts/branch.ts`
  - `plugins/commit-policy/tests/src/lib/contracts/branch.spec.ts`
- **Behavior current:** la negativa de commit sobre protected branch
  aparece condicionada al contexto de slice.
- **Behavior desired:**
  - Definir una sola `branchPolicy = { protected: [...] }`.
  - Cualquier path de commit (manual / threshold / interval / slice)
  - consulta esa policy antes de ejecutar.
  - Un commit manual a `develop` → refusal tipado.
  - Un threshold-triggered commit a `develop` → refusal tipado.
  - Un interval-triggered commit a `develop` → refusal tipado.
- **Tests:**
  - manual + develop → refusal
  - threshold + develop → refusal
  - interval + develop → refusal
  - manual + feature/x → ok
- **Acceptance:** tests verdes; ningún path de commit evade la policy.
- **Dependencies:** `f00182`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva.
- **Rollback:** revert.
- **Risk:** ninguno.

#### `f00182` — `CommitPolicyEngine`: orquestador central de triggers

- **Audit refs:** AUD-CP-002, AUD-CP-006, AUD-CP-008, AUD-CP-010, AUD-CP-011.
- **Goal:** extraer el engine que centraliza triggers, validaciones,
  staging y push policy.
- **Scope:** nueva clase `CommitPolicyEngine` + interfaces.
- **Non-goals:** no sustituir event bus global (eso es Track U);
  aceptar triggers como callbacks ahora.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/engine.spec.ts`
- **Behavior current:** cada trigger tiene su propio path al driver,
  sin orquestación.
- **Behavior desired:**
  ```ts
  interface CommitPolicyEngine {
    handle(event: TriggerEvent): Promise<EngineResult>;
  }
  type TriggerEvent =
    | { kind: 'slice'; proposalId; sliceId; files }
    | { kind: 'threshold'; files }
    | { kind: 'interval'; ts }
    | { kind: 'manual'; message; proposalId?; sliceId? };
  ```
  - `handle` valida selector, valida conventional (si aplica), stagea,
    commit, push (si aplica), registra evento procesado.
- **Tests:** cubre todos los triggers + casos de error.
- **Acceptance:** tests verdes; todos los paths pasan por el engine.
- **Dependencies:** base para `x00260`, `x00264`, `x00265`, `x00266`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** interna (refactor).
- **Rollback:** revert.
- **Risk:** integración gradual; mantener API pública.

#### `f00183` — Idempotency keys para commits automáticos

- **Audit refs:** AUD-CP-012, §54.
- **Goal:** añadir `idempotencyKey` a commits automáticos para que un
  retry del mismo evento no cree dos commits.
- **Scope:** engine + storage de processed-event IDs.
- **Non-goals:** no usar Redis ni DB; filesystem local está bien.
- **Files (expected):**
  - `plugins/commit-policy/src/lib/engine.ts`
  - `plugins/commit-policy/src/lib/processed-events.ts`
  - `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`
- **Behavior current:** replay del evento ejecuta commit dos veces.
- **Behavior desired:**
  - `idempotencyKey = 'commit-policy:<proposalId>:<sliceId>:<eventId>'`.
  - Antes de commit, check filesystem: si key existe → skip con ack
    `ALREADY_PROCESSED`.
  - Después de commit, append key al store.
  - TTL opcional para limpieza (configurable, default 30 días).
- **Tests:**
  - Primer `handle(event)` → commit.
  - Replay del mismo evento → no commit.
  - TTL expirado → vuelve a procesar (o no, según policy).
- **Acceptance:** `t00021` pasa.
- **Dependencies:** `f00182`.
- **Tokens impact:** ninguno.
- **Security impact:** positivo.
- **Compatibility:** aditiva.
- **Rollback:** revert.
- **Risk:** TTL muy largo puede llenar disco; configurable.

#### `t00017` — Conventional Commits parser: property-based + tabla de casos

- **Audit refs:** AUD-CP-001.
- **Goal:** cobertura completa del parser.
- **Scope:** `plugins/commit-policy/tests/src/lib/contracts/scope.spec.ts`.
- **Files:** mismo que arriba.
- **Cases (mínimo):**
  - `feat: x` → `feat(<scope>): x` (cuando aplica)
  - `fix: x` → `fix(<scope>): x`
  - `fix!: x` → `fix(<scope>)!: x`
  - `fix(core): x` → `fix(core): x` (unchanged)
  - `chore: x`, `refactor: x`, `perf: x`
  - tipos custom: `xyz: x` → `xyz(<scope>): x`
  - mensajes inválidos: `hola`, `:` vacío, whitespace al borde
  - unicode: `feat: corrección ñ`, emojis
- **Property-based:** genera 1000 mensajes aleatorios y verifica
  `parse(rebuild(x)) === x`.
- **Acceptance:** tests verdes.

#### `t00018` — Slice event staging: cross-agent safe (dos agentes dirty simultáneos)

- **Audit refs:** AUD-CP-005.
- **Goal:** reproducir el bug cross-agent contamination y probar que
  el fix lo evita.
- **Files:**
  - `plugins/commit-policy/tests/src/lib/triggers/slice-listener.spec.ts`
  - `plugins/commit-policy/tests/integration/cross-agent.spec.ts`
- **Cases:**
  - Agente A: dirty + staged `a.ts`.
  - Agente B: slice done con files `[b.ts]`.
  - Engine de B stagea solo `b.ts`.
  - `git diff --cached` ⊆ `[b.ts]`.
- **Acceptance:** tests verdes.

#### `t00019` — Threshold staging: reproduce "predicate ≠ action"

- **Audit refs:** AUD-CP-006.
- **Files:** `plugins/commit-policy/tests/src/lib/triggers/threshold.spec.ts`.
- **Cases:**
  - threshold=3, 2 dirty → no event.
  - threshold=3, 3 dirty → event con esos 3.
  - threshold=3, 4 dirty → event con los 4.
  - Staged ajenos no entran.
- **Acceptance:** tests verdes.

#### `t00020` — Plugin lifecycle: reload/dispose no duplica listeners

- **Audit refs:** AUD-CP-003.
- **Files:** `plugins/commit-policy/tests/src/index.spec.ts`.
- **Cases:**
  - load → 1 listener.
  - reload N → exactamente 1 listener.
  - dispose → 0 listeners activos.
  - error durante register → rollback + cleanup.
- **Acceptance:** tests verdes.

#### `t00021` — Idempotency: replay del mismo eventId → un solo commit

- **Audit refs:** AUD-CP-012, §54.
- **Files:** `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`.
- **Cases:**
  - 1er `handle(eventId=E)` → commit.
  - 2º `handle(eventId=E)` → no commit, ack `ALREADY_PROCESSED`.
  - `handle(eventId=F)` → commit (distinto evento).
- **Acceptance:** tests verdes.

---

### Track C — Arquitectura y boundaries (P1)

> **Nota arquitectónica**: las decisiones de boundary de este
> track están consolidadas en [`d00012`](../../ready/docs/d00012-adr-contracts-subpath-vs-package.md) (ADR 0007).
> `r00029` queda **superseded-by: d00012**.
> **Audit refs:** §6 (core god package), §7 (plugin-sdk),
> §8 (packages target), §9 (`core/public` amplio), §22-23 (client
> decoupling).
> **Goal:** introducir separación de responsabilidades en
> `@delendai/core` y desacoplar `@delendai/client` de `core/public`,
> manteniendo compatibilidad durante una ventana de deprecation.
> **Scope:** `packages/core/**` + `packages/client/**`.
> **Non-goals:** no partir el core en 20 micro-paquetes; refactor
> incremental.

### C.0 — Tabla de hijas

| ID       | Kind     | Priority | Title                                                                               |
| -------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| `r00027` | refactor | P1       | Inventario + clasificación stable/experimental/internal de `core/public`            |
| `r00028` | refactor | P1       | Subpath exports en `@delendai/core`: `/contracts`, `/plugin`, `/runtime`, `/node` |
| `r00029` | refactor | P1       | Extraer `@delendai/contracts` con tipos puros sin Node                            |
| `r00030` | refactor | P1       | `@delendai/client`: importar de `contracts`, no de `core/public`                  |
| `b00237` | breaking | P1       | Deprecar `nodeDynamicImport` exportado por `core/public`                            |

### C.1 — Detalle por hija

#### `r00027` — Inventario + clasificación stable/experimental/internal de `core/public`

- **Audit refs:** §50.
- **Goal:** producir un inventario machine-readable de todo lo
  exportado por `core/public` y clasificarlo.
- **Files (expected):**
  - `tools/scripts/inspect/core-public-inventory.script.ts`
  - `docs/mcp-vertex/CORE-PUBLIC-API-INVENTORY.md` (generado)
- **Behavior desired:**
  - Lista todos los exports de `core/public` con su tipo
    (function/class/type/const), madurez
    (`stable|experimental|internal|deprecated`), y plugin/source.
  - Salida en JSON + tabla MD.
- **Tests:** script ejecutable; diff fixture vs actual.
- **Acceptance:** inventario versionado y revisado.
- **Tokens impact:** ninguno.
- **Security impact:** ninguno.
- **Compatibility:** ninguno (es un análisis).
- **Rollback:** borrar el inventario.
- **Risk:** ninguno.

#### `r00028` — Subpath exports en `@delendai/core`

- **Audit refs:** §9.
- **Goal:** exponer subpath exports sin romper la API existente.
- **Files (expected):**
  - `packages/core/package.json` (export map)
  - `packages/core/src/contracts/index.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/src/node/index.ts`
  - `packages/core/src/plugin/index.ts`
- **Behavior desired:**
  ```jsonc
  {
    "exports": {
      ".": "./dist/public/index.js",
      "./contracts": "./dist/contracts/index.js",
      "./plugin": "./dist/plugin/index.js",
      "./runtime": "./dist/runtime/index.js",
      "./node": "./dist/node/index.js"
    }
  }
  ```
- **Acceptance:** cada subpath resuelve; tipos disponibles; un smoke
  test en `packages/core/tests` verifica cada uno.
- **Dependencies:** `r00029`.
- **Tokens impact:** ninguno.
- **Compatibility:** aditiva.
- **Rollback:** revert del `exports`.
- **Risk:** bundlers sensibles al orden de `exports`; revisar builds.

#### `r00029` — Extraer `@delendai/contracts` con tipos puros sin Node

- **Audit refs:** §23, §9.
- **Goal:** un paquete con tipos y constantes, sin Node imports.
- **Files (expected):**
  - `packages/contracts/**`
  - mover tipos puros desde `core/public` a `contracts`
- **Behavior desired:** `import type { Foo } from '@delendai/contracts'`
  resuelve sin arrastrar Node.
- **Acceptance:**
  - Paquete publicable.
  - Sin imports de `node:*`, `fs`, `path`, etc.
  - Lint arquitectónico lo verifica.
- **Dependencies:** `r00027`.
- **Compatibility:** aditiva.
- **Risk:** ciclos con `core`; resolver con cuidado.

#### `r00030` — `@delendai/client`: importar de `contracts`, no de `core/public`

- **Audit refs:** §23.
- **Goal:** desacoplar el cliente de la API pública amplia del core.
- **Files (expected):**
  - `packages/client/src/**/*.ts`
- **Behavior desired:** ninguna importación de `@delendai/core/public`
  para tipos puros; solo para runtime.
- **Tests:** lint `no-core-public-types-in-client.script.ts`.
- **Acceptance:** lint pasa; bundles del cliente decrecen.
- **Dependencies:** `r00029`.
- **Compatibility:** aditiva.
- **Risk:** algunas APIs requieren runtime (no solo types); mantener
  los imports de runtime explícitos.

#### `b00237` — Deprecar `nodeDynamicImport` exportado por `core/public`

- **Audit refs:** §9.
- **Goal:** dejar de exportar Node-only helpers desde la superficie
  universal.
- **Files (expected):**
  - `packages/core/src/public/index.ts` (deprecation comment)
  - `packages/core/src/node/index.ts` (movido)
- **Behavior desired:**
  - `nodeDynamicImport` ahora vive en `@delendai/core/node`.
  - Desde `core/public` queda como `@deprecated` y emite warning.
- **Acceptance:** smoke + warning visible en tests.
- **Compatibility:** breaking (warning).
- **Rollback:** revert.
- **Risk:** clientes existentes rotos; CHANGELOG claro.

---

### Track D — Lifecycle & plugin states (P1)

> **Audit refs:** §10 (lifecycle prepare/activate), §12 (plugin states).
> **Goal:** introducir fases `prepare/activate/dispose` explícitas y
> estados `UNLOADED/LOADED_HIDDEN/ACTIVE/DENIED`.
> **Scope:** `packages/core/src/lib/plugins/**`.
> **Non-goals:** no romper plugins actuales; compatibilidad aditiva.

### D.0 — Tabla de hijas

| ID       | Kind  | Priority | Title                                                     |
| -------- | ----- | -------- | --------------------------------------------------------- |
| `f00184` | feat  | P1       | Lifecycle phases: `prepare()` / `activate()` separadas    |
| `f00185` | feat  | P1       | Plugin states: UNLOADED / LOADED_HIDDEN / ACTIVE / DENIED |
| `c00134` | chore | P2       | Métricas de plugin lifecycle en dashboard                 |

### D.1 — Detalle por hija

#### `f00184` — Lifecycle phases: `prepare()` / `activate()` separadas

- **Audit refs:** §10.
- **Goal:** introducir `prepare()` side-effect-free antes de
  `activate()` que es donde se conceden capabilities.
- **Files (expected):**
  - `packages/core/src/lib/plugins/lifecycle.ts`
  - `packages/core/src/lib/plugins/lifecycle.spec.ts`
- **Behavior desired:**
  ```ts
  interface PluginLifecycle {
    prepare(ctx): Promise<PreparedPlugin>; // sin side effects
    activate(prepared, ctx): Promise<ActivePlugin>;
    dispose(active): Promise<void>;
  }
  ```
- **Acceptance:** tests cubren las fases, errores, rollback.
- **Compatibility:** aditiva con deprecation del patrón actual.
- **Risk:** plugins actuales que asumen side effects en `register` deben
  migrarse.

#### `f00185` — Plugin states: UNLOADED / LOADED_HIDDEN / ACTIVE / DENIED

- **Audit refs:** §12.
- **Goal:** API explícita con semántica clara.
- **Files (expected):**
  - `packages/core/src/lib/plugins/states.ts`
  - `packages/core/src/lib/plugins/router.ts`
- **Behavior desired:**
  - `hide` → LOADED_HIDDEN, no aparece en `tools/list`.
  - `disable` → router no permite invocarlo.
  - `unload` → dispose, queda UNLOADED.
  - `deny` → DENIED, política impide.
- **Acceptance:** tests cubren transiciones + invariantes (p. ej.
  DENIED es absorbente).
- **Compatibility:** aditiva.

#### `c00134` — Métricas de plugin lifecycle en dashboard

- **Audit refs:** §12, §48.
- **Goal:** `plugin.loaded`, `plugin.activated`, `plugin.invoked`,
  `plugin.unloaded`, `plugin.denied`.
- **Files:**
  - `packages/core/src/lib/observability/plugin-metrics.ts`
- **Behavior desired:** counters exportados al dashboard.
- **Acceptance:** métricas visibles en dashboard y entry point
  documentado.

---

### Track E — Token efficiency & central budgets (P1)

> **Audit refs:** §13-21.
> **Goal:** reducir coste de tokens en hotspots (`proposals`,
> `orchestrator-runner`) sin perder capacidad; centralizar
> `TokenBudgetRegistry`.
> **Scope:** `plugins/proposals/**`, `plugins/orchestrator-runner/**`,
> `packages/core/src/lib/budgets/**`.
> **Non-goals:** no fusionar tools por ahorrar schemas; no subir
> presupuestos.

### E.0 — Tabla de hijas

| ID       | Kind     | Priority | Title                                                            |
| -------- | -------- | -------- | ---------------------------------------------------------------- |
| `r00031` | refactor | P1       | Compactar output schema de `proposal_get` (hotspot 51 KB)        |
| `r00032` | refactor | P1       | Compactar output schema de `orchestrator-runner` (hotspot 43 KB) |
| `f00186` | feat     | P1       | `TokenBudgetRegistry` unificado                                  |
| `f00187` | feat     | P1       | `detail: compact \| normal \| full` transversal                  |
| `c00135` | chore    | P1       | Separar dashboards adaptive vs native                            |
| `c00136` | chore    | P1       | Token ROI por plugin (KPI)                                       |

### E.1 — Detalle por hija

#### `r00031` — Compactar output schema de `proposal_get`

- **Audit refs:** §13, §14, §16.
- **Goal:** reducir el schema sin perder capacidad.
- **Files:**
  - `plugins/proposals/src/lib/tools/get.ts`
  - `plugins/proposals/src/lib/contracts/proposal.ts`
- **Behavior desired:**
  - Default: `{ id, status, progress, next, summary, kind }`.
  - `detail: 'full'` devuelve árbol completo vía resource.
  - `detail: 'normal'` devuelve 2 niveles.
- **Acceptance:**
  - `staticBytes` antes/después medido.
  - Tests cubren cada nivel.
- **Compatibility:** aditiva.
- **Risk:** clientes que asumen full por default; documentar.

#### `r00032` — Compactar output schema de `orchestrator-runner`

- **Audit refs:** §13, §14.
- **Misma estrategia que `r00031`** aplicado al plugin
  `orchestrator-runner`.
- **Acceptance:** reducción documentada con tabla antes/después.

#### `f00186` — `TokenBudgetRegistry` unificado

- **Audit refs:** §21.
- **Goal:** una sola API consumida por CI, dashboard, docs, tests, CLI.
- **Files:**
  - `packages/core/src/lib/budgets/registry.ts`
  - `packages/core/src/lib/budgets/registry.spec.ts`
- **Behavior desired:**
  ```ts
  const registry = new TokenBudgetRegistry({ sources: [...] });
  registry.measure(surface);
  registry.validate(surface); // throws if hard breach
  registry.report(surface);
  ```
- **Acceptance:** registry usado por todos los gates existentes
  (`tokens:dashboard:check`, `tokens:preset-gate`).
- **Compatibility:** wrappers durante migración.
- **Risk:** cambio de contratos; alinear con `c00005`.

#### `f00187` — `detail: compact | normal | full` transversal

- **Audit refs:** §15.
- **Files:**
  - `packages/core/src/lib/contracts/detail.ts`
  - aplicar a proposals, orchestrator, audit, usage, logs, project
    health, dependencies, search.
- **Behavior desired:** cada tool afectado acepta `detail` y devuelve
  según el nivel.
- **Acceptance:** cobertura de tests por tool; tabla antes/después.

#### `c00135` — Separar dashboards adaptive vs native

- **Audit refs:** §21, §20.
- **Goal:** que el dashboard no mezcle bytes de adaptive con tokens
  estimados de native.
- **Files:**
  - `apps/web/src/data/...` (dashboard)
- **Behavior desired:** dos columnas separadas; `Documented deficits`
  refleja breaches reales.
- **Acceptance:** dashboard regenera sin mezclar.

#### `c00136` — Token ROI por plugin (KPI)

- **Audit refs:** §19.
- **Goal:** calcular
  `tokenROI = (successful_calls × value) / (schema + response tokens)`.
- **Files:**
  - `packages/core/src/lib/budgets/roi.ts`
  - dashboard entry.
- **Acceptance:** KPI visible y consumible por
  `auto-plugin-selector`.

---

### Track F — Security capabilities (P0/P1)

> **Audit refs:** §28 (capability model), §29 (dry-run).
> **Goal:** introducir modelo de capabilities declarativo y
  enforcement real; `dryRun` transversal.
> **Scope:** `packages/core/src/lib/capabilities/**`,
  `packages/core/src/lib/dry-run/**`.
> **Privacidad:** enforcement explícito de capabilities reduce
  superficie de leak por plugins deshonestos.

### F.0 — Tabla de hijas

| ID       | Kind  | Priority | Title                                                    |
| -------- | ----- | -------- | -------------------------------------------------------- |
| `f00188` | feat  | P0       | Capability schema + enforcement en `PluginContext`       |
| `f00189` | feat  | P1       | `dryRun` transversal para tools con `effects: ['write']` |
| `c00137` | chore | P1       | Lint de capabilities no declaradas                       |
| `d00009` | docs  | P2       | Capability matrix documentada                            |

### F.1 — Detalle por hija

#### `f00188` — Capability schema + enforcement

- **Audit refs:** §28.
- **Goal:** declarar y hacer cumplir capabilities.
- **Files:**
  - `packages/core/src/lib/capabilities/schema.ts`
  - `packages/core/src/lib/capabilities/inject.ts`
- **Behavior desired:**
  ```ts
  definePlugin({
    capabilities: ['git:write', 'fs:read'],
    register(ctx) {
      // ctx.capabilities.git.write(...) — solo si está declarada
    },
  });
  ```
- **Acceptance:** tests adversarios: plugin que intenta llamar sin
  capability recibe refusal.
- **Compatibility:** gradual (migration shim).
- **Risk:** plugins existentes rotos; documentar migración.

#### `f00189` — `dryRun` transversal

- **Audit refs:** §29.
- **Files:**
  - `packages/core/src/lib/dry-run/protocol.ts`
  - aplicar a plugins que tienen `effects: ['write']`.
- **Behavior desired:**
  ```ts
  if (args.dryRun) return { wouldChange: [...], wouldRun: [...], risk };
  ```
- **Acceptance:** al menos un plugin ejemplo (commit-policy) soporta
  dryRun.

#### `c00137` — Lint de capabilities no declaradas

- **Files:**
  - `tools/scripts/lint/capabilities-declared.script.ts`
- **Acceptance:** falla CI si un plugin accede a capabilities no
  declaradas en su manifest.

#### `d00009` — Capability matrix documentada

- **Files:**
  - `docs/mcp-vertex/CAPABILITY-MATRIX.md` (generado)
- **Acceptance:** matriz generada desde manifests; revisada.

---

### Track G — CI scalability (P1)

> **Audit refs:** §30 (affected CI), §31 (3 tiers), §32 (pack smoke).
> **Goal:** affected CI + 3 tiers + smoke job con output preservado.
> **Scope:** workflows de GitHub Actions + scripts de soporte.

### G.0 — Tabla de hijas

| ID       | Kind         | Priority | Title                                                |
| -------- | ------------ | -------- | ---------------------------------------------------- |
| `c00138` | chore        | P1       | Affected CI: grafo de dependencias + filtro          |
| `c00139` | chore        | P1       | Tier 1/2/3 jobs (feedback <1 min, PR, merge/nightly) |
| `x00268` | fix          | P1       | Pack smoke: preservar output de fallo                |
| `v00126` | verification | P1       | Verify CI local reproduce fallos reales              |

### G.1 — Detalle por hija

#### `c00138` — Affected CI: grafo + filtro

- **Audit refs:** §30, §49.
- **Files:**
  - `tools/scripts/ci/affected.script.ts`
  - `.github/workflows/affected.yml`
- **Behavior desired:** desde `git diff`, calcular paquetes afectados
  transitivamente; ejecutar sus jobs solo.
- **Acceptance:** un PR a un plugin no dispara jobs de plugins no
  afectados.

#### `c00139` — Tier 1/2/3 jobs

- **Audit refs:** §31.
- **Files:** `.github/workflows/{tier1,tier2,tier3}.yml`.
- **Acceptance:** cada tier corre en su trigger con su batería.

#### `x00268` — Pack smoke: preservar output de fallo

- **Audit refs:** §32.
- **Files:**
  - `.github/workflows/pack-smoke.yml` (o equivalente)
- **Behavior desired:** script bash usa `set +e`, captura
  `2>&1`, imprime output, exit con status correcto.
- **Acceptance:** un fallo en node preserva el output en logs.

#### `v00126` — Verify CI local reproduce fallos reales

- **Files:**
  - `tools/scripts/ci/local-repro.script.ts`
- **Behavior desired:** dado un CI run fallido, descargar logs y
  permitir ejecutar localmente el step que falló.
- **Acceptance:** script ejecutable; demo con un fallo reciente.

---

### Track H — Docs drift / AGENT.md / code-map (P1)

> **Audit refs:** §34 (generated numbers), §35 (proposal ID comments),
> §36 (AGENT.md), §37 (code-map).
> **Goal:** que los datos cuantitativos estén generados; eliminar
> comentarios `// fNNNNN`; introducir AGENT.md y code-map.

### H.0 — Tabla de hijas

| ID       | Kind  | Priority | Title                                                        |
| -------- | ----- | -------- | ------------------------------------------------------------ |
| `c00140` | chore | P1       | Generar datos cuantitativos (plugin count, tool count, etc.) |
| `c00141` | chore | P1       | Eliminar comentarios `// fNNNNN` del source                  |
| `f00190` | feat  | P2       | `AGENT.md` por package/plugin (generado)                     |
| `d00010` | docs  | P2       | `vertex://code-map` resource documentado                     |
| `d00011` | docs  | P2       | Manual editorial: qué se queda manual vs generado            |

### H.1 — Detalle por hija

#### `c00140` — Generar datos cuantitativos

- **Audit refs:** §34, AUD-P0-003.
- **Files:** `tools/scripts/gen/all.script.ts`, `docs/mcp-vertex/*.md`
  regenerados.
- **Acceptance:** números en docs coinciden con el árbol real;
  CI falla con diff si hay drift.

#### `c00141` — Eliminar comentarios `// fNNNNN` del source

- **Audit refs:** §35.
- **Files:** varios `src/**/*.ts`.
- **Acceptance:** lint `no-proposal-id-comments-in-source.script.ts`
  pasa; trazabilidad vive en git/proposal graph.

#### `f00190` — `AGENT.md` por package/plugin

- **Audit refs:** §36.
- **Files:** `tools/scripts/gen/agent-md.script.ts`.
- **Behavior desired:** cada package/plugin genera un AGENT.md con
  purpose, public, depends, writes, entry, tests, do_not,
  token_hotspots.
- **Acceptance:** AGENT.md existe para los 50+ plugins; < 400 tokens
  cada uno.

#### `d00010` — `vertex://code-map` documentado

- **Audit refs:** §37.
- **Files:** `docs/mcp-vertex/CODE-MAP.md`.
- **Acceptance:** resource MCP expuesto; manual de uso.

#### `d00011` — Manual editorial: qué se queda manual vs generado

- **Files:** `docs/mcp-vertex/DOCS-MANUAL-VS-GENERATED.md`.
- **Acceptance:** convención escrita.

---

### Track I — CLI / mcpv doctor / web (P1)

> **Audit refs:** §24 (doctor), §25 (web).
> **Goal:** introducir `mcpv doctor` y arreglar drift web.

### I.0 — Tabla de hijas

| ID       | Kind  | Priority | Title                                          |
| -------- | ----- | -------- | ---------------------------------------------- |
| `f00191` | feat  | P1       | `mcpv doctor`: health check completo           |
| `c00142` | chore | P1       | Web: regenerar docs/capacities desde manifests |

### I.1 — Detalle por hija

#### `f00191` — `mcpv doctor`

- **Audit refs:** §24.
- **Files:**
  - `packages/cli/src/commands/doctor.ts`
  - `packages/cli/src/commands/doctor.spec.ts`
- **Behavior desired:** verifica config, manifests, artifacts, plugin
  graph, deps, token budgets, branch protection, git status, runtime,
  MCP handshake, stale docs, schemas, ports, permissions, CI status.
  Salida: `Health: NN/100` + listas P0/P1/P2.
- **Acceptance:** comando ejecutable; CI lo invoca; dashboard entry.

#### `c00142` — Web: regenerar docs/capabilities desde manifests

- **Audit refs:** §25.
- **Files:** `apps/web/src/data/pages/...`.
- **Acceptance:** sin listas manuales; CI falla con drift.

---

### Track J — VSCode Agent Timeline + explainability (P2)

> **Audit refs:** §26 (timeline), §27 (explain).
> **Goal:** vista Agent Timeline y `vertex_explain_last_decision`.

### J.0 — Tabla de hijas

| ID       | Kind | Priority | Title                      |
| -------- | ---- | -------- | -------------------------- |
| `f00192` | feat | P2       | VSCode Agent Timeline view |

### J.1 — Detalle por hija

#### `f00192` — VSCode Agent Timeline

- **Audit refs:** §26.
- **Files:** `extensions/vscode/src/views/agent-timeline.ts` +
  `webview`.
- **Behavior desired:** timeline con eventos (claim, activate, change,
  test, cost, commit, close); cada evento con why/cost/inputs/outputs.
- **Acceptance:** vista abre en VSCode; datos desde un log
  persistido.
- **Privacy:** el log es local; no envía telemetría.

---

### Track K — External MCPs + capability versioning (P2)

> **Audit refs:** §39 (external MCPs), §38 (capability versioning).
> **Goal:** routing de MCPs externos + versionado por capability.

### K.0 — Tabla de hijas

| ID       | Kind | Priority | Title                                                    |
| -------- | ---- | -------- | -------------------------------------------------------- |
| `f00193` | feat | P2       | External MCPs como plano de control                      |
| `f00194` | feat | P2       | Capability versioning (`requires: { capability: '^2' }`) |

### K.1 — Detalle por hija

#### `f00193` — External MCPs como plano de control

- **Audit refs:** §39.
- **Files:** `packages/client/src/services/external-mcp/**`.
- **Behavior desired:** cliente soporta múltiples proveedores externos;
  Vertex decide según coste/latencia/calidad.
- **Acceptance:** health check por proveedor; routing configurable.

#### `f00194` — Capability versioning

- **Audit refs:** §38.
- **Files:** `packages/core/src/lib/capabilities/versioning.ts`.
- **Behavior desired:** `requires: { 'git.write': '^2' }`.
- **Acceptance:** resolución de providers según version; tests.

---

### Track L — Cost-aware routing & model-aware presets (P2)

> **Audit refs:** §40 (routing), §41 (model-aware presets).
> **Goal:** utility function + modelProfiles.

### L.0 — Tabla de hijas

| ID       | Kind | Priority | Title                      |
| -------- | ---- | -------- | -------------------------- |
| `f00195` | feat | P2       | Cost-aware routing utility |
| `f00196` | feat | P2       | Model-aware presets        |

### L.1 — Detalle por hija

#### `f00195` — Cost-aware routing utility

- **Audit refs:** §40.
- **Files:** `packages/core/src/lib/routing/utility.ts`.
- **Behavior desired:** `utility = quality - tokenCost*λ -
  latency*μ - securityRisk*ν`.
- **Acceptance:** tests con datos sintéticos.

#### `f00196` — Model-aware presets

- **Audit refs:** §41.
- **Files:** `packages/core/src/lib/presets/model-profiles.ts`.
- **Behavior desired:** `modelProfiles.{small|medium|large}` con
  `maxInitialToolTokens`.

---

### Track M — Envelopes + structuredContent rule + KPIs (P2)

> **Audit refs:** §46 (envelopes), §47 (structuredContent), §48 (KPIs).
> **Goal:** envelopes compartidos + regla structuredContent vs content
  vs _meta + KPIs.

### M.0 — Tabla de hijas

| ID       | Kind     | Priority | Title                                                 |
| -------- | -------- | -------- | ----------------------------------------------------- |
| `f00197` | feat     | P2       | Memory utility score                                  |
| `r00033` | refactor | P2       | Envelopes compartidos (EntityRef, OperationResult, …) |
| `f00198` | feat     | P2       | Activation precision / recall / churn                 |
| `f00199` | feat     | P2       | Tool confusion rate                                   |

### M.1 — Detalle por hija

#### `f00197` — Memory utility score

- **Audit refs:** §42.
- **Files:** `packages/core/src/lib/memory/utility.ts`.
- **Behavior desired:** score basado en recency, similarity, usage;
  inyectar solo memorias con `utility > costThreshold`.

#### `r00033` — Envelopes compartidos

- **Audit refs:** §46.
- **Files:** `packages/contracts/src/envelopes.ts`.
- **Behavior desired:** `EntityRef`, `OperationResult`, `PagedResult`,
  `MutationResult`, `DiagnosticResult`, `ResourceResult` reutilizados.

#### `f00198` — Activation precision / recall / churn

- **Audit refs:** §48.
- **Files:** `packages/core/src/lib/observability/activation-kpis.ts`.
- **Acceptance:** KPIs visibles en dashboard.

#### `f00199` — Tool confusion rate

- **Audit refs:** §48.
- **Files:** `packages/core/src/lib/observability/tool-confusion.ts`.
- **Acceptance:** detecta pairs de tools con alta confusion.

---

### Track N — API stability + lazy loading + idempotency (P2)

> **Audit refs:** §50 (API stability), §52 (lazy loading), §54
> (idempotency).
> **Goal:** clasificación stable/experimental/internal + lazy loading
  real + idempotency keys para mutaciones.

### N.0 — Tabla de hijas

| ID       | Kind     | Priority | Title                                          |
| -------- | -------- | -------- | ---------------------------------------------- |
| `b00238` | breaking | P2       | Marcar APIs internas como `internal`           |
| `f00200` | feat     | P2       | Lazy loading real de plugins                   |
| `c00143` | chore    | P2       | Idempotency keys para mutaciones (propagación) |

### N.1 — Detalle por hija

#### `b00238` — Marcar APIs internas como `internal`

- **Audit refs:** §50.
- **Files:** varios.
- **Behavior desired:** APIs internas con naming `*Internal` o barrel
  `/_internal`.
- **Acceptance:** changelog claro.

#### `f00200` — Lazy loading real

- **Audit refs:** §52.
- **Files:** `packages/core/src/lib/plugins/lazy-loader.ts`.
- **Behavior desired:** `manifest discovery → selection → dynamic
  import solo de selected`.
- **Acceptance:** medir cold-start mejora.

#### `c00143` — Idempotency keys para mutaciones

- **Audit refs:** §54.
- **Files:** propagar `idempotencyKey` por mutaciones (commit, push,
  issue create, …).
- **Acceptance:** cada mutación crítica respeta la key.

---

### Track O — Workflow transactions (P3)

> **Audit refs:** §55.
> **Goal:** `vertex_transaction` con compensación declarativa.

### O.0 — Tabla de hijas

| ID       | Kind | Priority | Title                                              |
| -------- | ---- | -------- | -------------------------------------------------- |
| `f00201` | feat | P3       | Workflow transactions: plan / execute / compensate |

### O.1 — Detalle por hija

#### `f00201` — Workflow transactions

- **Audit refs:** §55.
- **Files:** `packages/core/src/lib/transactions/**`.
- **Behavior desired:**
  - `plan([stepA, stepB, stepC])`
  - ejecuta A, B, C
  - si C falla → compensate B, compensate A
  - cada step declara `effects` y `compensable: bool`
- **Acceptance:** tests con steps sintéticos (sin side effects reales).

---

# Tabla maestra de estado (orquestador)

Esta tabla es la **fuente viva** que refleja el estado real de las
hijas. Se actualiza a medida que cada hija avanza (no al final).

| Track | ID       | Kind         | Priority | Status  | SHA evidence | Notas                           |
| ----- | -------- | ------------ | -------- | ------- | ------------ | ------------------------------- |
| A     | `c00130` | chore        | P0       | pending | —            | Proteger develop en GitHub      |
| A     | `c00131` | chore        | P0       | pending | —            | default protectedBranches       |
| A     | `c00132` | chore        | P0       | pending | —            | quality gate real               |
| A     | `c00133` | chore        | P0       | pending | —            | drift CI                        |
| A     | `x00257` | fix          | P0       | pending | —            | no force en protected           |
| A     | `x00258` | fix          | P0       | pending | —            | bloquear push directo a develop |
| A     | `v00125` | verification | P0       | pending | —            | verify develop green            |
| B     | `x00259` | fix          | P0       | pending | —            | buildScopedMessage preservar    |
| B     | `x00260` | fix          | P0       | pending | —            | listener → engine               |
| B     | `x00261` | fix          | P0       | pending | —            | dispose listener                |
| B     | `x00262` | fix          | P0       | pending | —            | selector exacto                 |
| B     | `x00263` | fix          | P0       | pending | —            | sliceScoping stagea exactos     |
| B     | `x00264` | fix          | P1       | pending | —            | threshold staging               |
| B     | `x00265` | fix          | P1       | pending | —            | requireConventional             |
| B     | `x00266` | fix          | P1       | pending | —            | push policy engine              |
| B     | `f00182` | feat         | P1       | pending | —            | CommitPolicyEngine              |
| B     | `f00183` | feat         | P1       | pending | —            | idempotency keys                |
| B     | `t00017` | test         | P0       | pending | —            | conventional property-based     |
| B     | `t00018` | test         | P0       | pending | —            | cross-agent staging             |
| B     | `t00019` | test         | P1       | pending | —            | threshold staging               |
| B     | `t00020` | test         | P1       | pending | —            | plugin lifecycle                |
| B     | `t00021` | test         | P1       | pending | —            | idempotency replay              |
| C     | `r00027` | refactor     | P1       | pending | —            | inventario core/public          |
| C     | `r00028` | refactor     | P1       | pending | —            | subpath exports                 |
| C     | `r00029` | refactor     | P1       | pending | —            | @delendai/contracts           |
| C     | `r00030` | refactor     | P1       | pending | —            | client usa contracts            |
| C     | `b00237` | breaking     | P1       | pending | —            | deprecate nodeDynamicImport     |
| D     | `f00184` | feat         | P1       | pending | —            | prepare/activate                |
| D     | `f00185` | feat         | P1       | pending | —            | plugin states                   |
| D     | `c00134` | chore        | P2       | pending | —            | métricas lifecycle              |
| E     | `r00031` | refactor     | P1       | pending | —            | proposal_get compact            |
| E     | `r00032` | refactor     | P1       | pending | —            | orchestrator compact            |
| E     | `f00186` | feat         | P1       | pending | —            | TokenBudgetRegistry             |
| E     | `f00187` | feat         | P1       | pending | —            | detail levels                   |
| E     | `c00135` | chore        | P1       | pending | —            | dashboards separados            |
| E     | `c00136` | chore        | P1       | pending | —            | token ROI KPI                   |
| F     | `f00188` | feat         | P0       | pending | —            | capabilities enforcement        |
| F     | `f00189` | feat         | P1       | pending | —            | dryRun transversal              |
| F     | `c00137` | chore        | P1       | pending | —            | lint capabilities               |
| F     | `d00009` | docs         | P2       | pending | —            | capability matrix               |
| G     | `c00138` | chore        | P1       | pending | —            | affected CI                     |
| G     | `c00139` | chore        | P1       | pending | —            | tiers 1/2/3                     |
| G     | `x00268` | fix          | P1       | pending | —            | pack smoke output               |
| G     | `v00126` | verification | P1       | pending | —            | local repro                     |
| H     | `c00140` | chore        | P1       | pending | —            | generar números                 |
| H     | `c00141` | chore        | P1       | pending | —            | quitar // fNNNNN                |
| H     | `f00190` | feat         | P2       | pending | —            | AGENT.md por package            |
| H     | `d00010` | docs         | P2       | pending | —            | vertex://code-map               |
| H     | `d00011` | docs         | P2       | pending | —            | manual vs generado              |
| I     | `f00191` | feat         | P1       | pending | —            | mcpv doctor                     |
| I     | `c00142` | chore        | P1       | pending | —            | web regenerada                  |
| J     | `f00192` | feat         | P2       | pending | —            | Agent Timeline                  |
| K     | `f00193` | feat         | P2       | pending | —            | external MCPs router            |
| K     | `f00194` | feat         | P2       | pending | —            | capability versioning           |
| L     | `f00195` | feat         | P2       | pending | —            | routing utility                 |
| L     | `f00196` | feat         | P2       | pending | —            | model-aware presets             |
| M     | `f00197` | feat         | P2       | pending | —            | memory utility                  |
| M     | `r00033` | refactor     | P2       | pending | —            | envelopes compartidos           |
| M     | `f00198` | feat         | P2       | pending | —            | activation KPIs                 |
| M     | `f00199` | feat         | P2       | pending | —            | tool confusion                  |
| N     | `b00238` | breaking     | P2       | pending | —            | APIs internal                   |
| N     | `f00200` | feat         | P2       | pending | —            | lazy loading real               |
| N     | `c00143` | chore        | P2       | pending | —            | idempotency propagada           |
| O     | `f00201` | feat         | P3       | pending | —            | workflow transactions           |

**Total:** 66 hijas.

---

# Definition of Done global para este plan

Reaplicar y endurecer la DoD de la auditoría §65:

- comportamiento reproducido antes del cambio (test reproductor);
- implementación;
- typecheck verde;
- tests del package verdes;
- tests de integración afectados verdes;
- generated artifacts sincronizados (Track A `c00133`);
- manifests sincronizados (Track C `r00027`);
- docs actualizadas / generadas (Track H);
- **token delta medido** si cambia surface/schema (Track E);
- branch/CI policy validada si aplica (Track A `v00125`);
- **no nueva violación arquitectónica** (lints pasan);
- **no side effect no declarado**;
- **no exposición de datos del usuario** en logs / metrics / reports
  (R1.x);
- **no telemetría saliente** del usuario, su repo, su empresa (R1.9);
- **fixtures y tests sintéticos** (R8);
- changelog/proposal cerrada con evidencia en SHA de cierre (R6).

---

# Riesgos y rollback global

- Si el plan no cierra (algún track queda en blockers), el
  `q00006-close` se rechaza con lista de blockers.
- Rollback por hija: revert del SHA de evidence.
- Rollback del plan completo: dejar `q00006` en `paused` y abrir un
  nuevo plan sucesor (`q00007`) que reorqueste.

---

# Cómo ejecutar este plan con `mcp-vertex`

1. `mcp-vertex_overview { compact: true }` (orientación).
2. `mcp-vertex_proposals_auto_work` para seleccionar la siguiente
   hija claimable.
3. `mcp-vertex_proposals_continue_proposal { id, mode: "plan" }` para
   inspeccionar slices.
4. `mcp-vertex_proposals_delegate { taskId, slot, files }` para
   delegar al runner con worktree aislado.
5. Implementar solo dentro de los archivos claimados.
6. `bun run validate` local antes de cerrar slice.
7. `mcp-vertex_proposals_close_slice { id, sliceId }`.
8. Tras cerrar todas las hijas, `mcp-vertex_proposals_close_plan
   { planId: "q00006", reason: "..." }`.

No abrir nuevas proposals fuera del plan para hallazgos del mismo
dominio; ampliar `q00006` con nuevas IDs manteniendo los rangos por
track.

---

# Prompt reutilizable para auditoría futura

Cuando todas las hijas de `q00006` estén en `done`, abrir una
conversación nueva y pegar este prompt (sin contexto previo):

````markdown
Quiero que hagas una auditoría técnica EXHAUSTIVA y completamente
independiente del siguiente repositorio:

REPOSITORIO: CartagoGit/mcp-vertex
RAMA A AUDITAR: develop

REGLAS:
- No asumas nada de auditorías anteriores.
- Trabaja como si fuera la primera vez que ves el proyecto.
- Audita el estado REAL y ACTUAL de develop.
- Identifica el SHA exacto y úsalo como snapshot.
- No modifiques el repo; solo analiza.
- Contrasta documentación, código, tests, CI y estado real.
- Si algo está documentado pero no conectado, es hallazgo.
- Distingue: BUG CONFIRMADO, BUG PROBABLE, RIESGO, DEUDA, MEJORA,
  IDEA DE PRODUCTO.

REVISIÓN MÍNIMA (no exhaustiva en este resumen — la lista está en
el documento de auditoría):
1. Estado de develop (SHA, CI, branch protection).
2. Estructura completa del monorepo.
3. Arquitectura, boundaries, barrels, acoplamiento.
4. Core.
5. TODOS los plugins.
6. Features recién integradas (commit-policy, etc.).
7. Cliente, CLI, web, VS Code.
8. Tests, CI/CD.
9. Seguridad, capabilities, dry-run.
10. Tokens: tools/list, schemas, output, duplicates, budgets.
11. Adaptive surface, hysteresis, churn.
12. Proposals, orchestration, events, idempotency.
13. External MCPs.
14. Observabilidad, KPIs, explainability.
15. DX, AGENT.md, code-map.
16. Producto, posicionamiento.

PARA CADA HALLAZGO: id, clasificación, severidad, área, evidencia
concreta (path/función/test/CI), impacto, riesgo, repro, solución
mínima, solución ideal, tests, criterios de aceptación,
dependencias, impacto tokens, compatibilidad.

PUNTUACIONES 0-10 justificadas para todas las áreas.

AL FINAL: archivo MD descargable con TODO, índice, snapshot,
resumen, hallazgos, roadmap, métricas, arquitectura objetivo,
qué no hacer, plantilla de propuesta, DoD global y prompt
reutilizable idéntico al de este bloque.

Privacidad: este proyecto NO recopila, transmite ni expone datos
del usuario. Cualquier hallazgo que toque reporter/privacy/telemetry
debe verificarse contra esa invariante.
````

La auditoría nueva debe poder ejecutarse sin saber nada de
`q00006` ni de sus predecesores.

---

# Cierre

Al cerrar `q00006`:

1. `mcp-vertex_proposals_sync_proposals` para regenerar el índice.
2. `mcp-vertex_proposals_close_plan { planId: "q00006", reason: "..." }`.
3. Verificar el SHA final del cierre y archivarlo en este mismo
   documento (campo `closed-evidence`).
4. Si quedan hijos abiertos, abrir un sucesor `q00007` con los
   que falten.



## acceptance

This plan is closed when:

1. Each of the 65 daughter proposals is closed (`done`) with peer review.
2. The `proposals_close_plan` tool returns no blockers.
3. The audit criteria R1–R9 are all verified with evidence.
4. `bun run validate` is green on the closing SHA.
5. `develop` is protected and the quality gate is enforced.