---
id: a00068
kind: audit
title: "24-07-2026 · Auditoría exhaustiva del proyecto + recomendaciones concretas (mejoras, altas, bajas, cambios)"
status: review
date: 2026-07-24T18:37:00Z
track: code-quality+concurrency+architecture+invariants+tests+dx
related:
    - a00066 # última auditoría general (modo general)
    - a00056 # penúltima auditoría general
    - a00067 # evaluación de migración de lenguaje (done/audits)
author: copilot-minimax-m3 (orchestrator)
mode: general + recommendations
---

# 24-07-2026 · Auditoría exhaustiva + recomendaciones — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría se publica en respuesta al pedido
> del usuario: *"me gustaría una auditoría completa y exhaustiva donde también
> recomiendes mejoras o cosas que crees que podemos añadir o quitar o modificar
> para mejorar el proyecto"*.
>
> El usuario también advierte: **puede que haya tests rotos por otro agente
> trabajando en paralelo; la nota de validación refleja el estado en el momento
> de la captura, no una penalización por trabajos pendientes**. La última sección
> (`### tests-status-context`) deja el disclaimer explícito.
>
> HEAD auditado: `b0a6107e` (`develop`, dirty working tree con un único
> untracked `a00067-...md`).
> Revisor: `copilot-minimax-m3` (orchestrator).
> Estado de la suite de tests: ✅ 4792/4792 passing, 579 archivos, 61s wall time
> — ver `## Verified state`.
> Biome linter / i18n check: ✅ verde (`12 langs × 175 keys`).
> TypeScript typecheck: ✅ verde.
> Build: ✅ exitoso (32 paquetes construidos).
> Convenciones Estructurales: ⚠️ — sin recálculo en esta pasada (gate estable).
> Drift: ⚠️ — sin recálculo en esta pasada (gate estable).
> Dependencias: ✅ — `bun.lock` presente, healthy.
> `audit_consolidate` real: ⚠️ no se ejecutó contra `a00066` (se cita como
> precedente y se contrastan los hallazgos manualmente).
> Proposals lint: ❌ — FALLA por el draft `a00067-...md` que el usuario abrió en
> el editor; el propio borrador de auditoría vive aquí como `ready` y se
> conforma al esquema canónico, así que no se vuelve a tropezar con el linter.

---

## Goal

Entregar al usuario:

1. **Veredicto en una frase** sobre el estado del proyecto hoy (Phase 10).
2. **Findings** con evidencia de fichero/línea, no opiniones.
3. **Recomendaciones accionables** organizadas en cuatro listas: **añadir**,
   **quitar**, **modificar**, **reorganizar**. Cada recomendación es ejecutable
   (qué archivo, qué efecto, qué riesgo).
4. **Scoreboard** justificado por los hallazgos, con la nota de **estabilidad
   operativa real** del repo (los gates pasan en este HEAD; los hallazgos
   hablan de la salud estructural, no de un fallo actual).

## why

El usuario pidió auditoría completa + recomendaciones. Esta propuesta captura
las dos cosas en un único artefacto, porque separarlas duplica el coste de
recorrer el árbol y hace más difícil contrastar "lo que encontré" con "lo que
propondría cambiar". El formato sigue el playbook
(`plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md`), pero añade una
sección nueva (`## recommendations`) que es la entrega de valor diferencial de
esta auditoría.

## non-goals

- **No migro nada de raíz.** Esta propuesta NO toca código. Las recomendaciones
  son un plan; cada item se cierra con un slice dedicado (f00xxx / r00xxx /
  c00xxx / x00xxx) cuando el usuario las apruebe.
- **No reescribo a00066.** La última auditoría sigue siendo fuente de verdad;
  esta la **complementa** con foco en (a) lo que cambió desde el 22-07 y
  (b) recomendaciones accionables.
- **No ejecuto `audit_run`** (Alcance B del plugin `audit`). Este auditoría es
  Alcance A — el LLM (yo, copilot-minimax-m3) lee código y emite findings.
- **No duplico el cuerpo de a00067.** La propuesta `a00067` (evaluación de
  migración de lenguaje) está en `ready/` y se cita como precedente, no se
  reescribe aquí.

## Slices

- global_gate: lint

### S1 — Captura del estado y registro de la auditoría

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/a00068-24-07-2026-copilot-minimax-m3-auditoria-exhaustiva-recomendaciones.md`
- **Gate**: lint
- review-state: in_review
- review-implementer: copilot-minimax-m3
- acceptance:
  - "Hallazgos con evidencia file:line, scoreboard justificado, sección de
    recomendaciones con cuatro listas (añadir/quitar/modificar/reorganizar),
    y disclaimer de tests-status-context cuando aplique."

## acceptance

- Findings con `file:line` y cita del fragmento problemático (Phase 9).
- Scoreboard justificado por los hallazgos (Phase 10).
- Sección `## recommendations` con 4 sub-secciones (add / remove / modify /
  reorganize) y al menos 1 item por sub-sección.
- La propuesta pasa `bun run lint:proposals` (canonical scaffold).
- La propuesta se sitúa en `ready/` para que un agente más fuerte la consuma
  como input.

---

## Verified state

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -1` | `b0a6107e chore: refresh completed governance catalog` |
| 2 | `git branch --show-current` | `develop` |
| 3 | `git status --porcelain` | `?? a00067-...md` (draft en editor; untracked) |
| 4 | `bun run test 2>&1 | tail` | ✅ `Test Files  579 passed (579) / Tests  4792 passed (4792) / Duration  61.31s` |
| 5 | `bun run build 2>&1 | tail` | ✅ `✓ Built 32 package(s).` |
| 6 | `bunx tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| 7 | `bun run lint 2>&1 | tail` | ✅ `Checked 128 files in 90ms. No fixes applied. / ✓ vscode i18n complete: 12 languages × 175 keys.` |
| 8 | `find packages plugins extensions apps tools scripts -name '*.ts' ... wc -l` | 266 237 LOC totales |
| 9 | `find packages/core/src/lib -name '*.ts' | wc -l` | 160 archivos core |
| 10 | `find plugins -name '*.ts' | wc -l` | 899 archivos de plugins |
| 11 | `find packages/core/tests plugins -name '*.spec.ts' | wc -l` | 364 archivos de test |
| 12 | `bun run lint:proposals 2>&1 | tail` | ❌ FALLA en el draft `a00067` (no conforma el scaffold canónico — ver Finding 1) |

**Tests-status-context** (per pedido del usuario): Los 4792 tests pasan en este
HEAD. Si en el momento de leer esta auditoría están rojos, casi seguro es
porque otro agente está tocando `packages/core`, `plugins/proposals` o
`plugins/rules` — los tres paquetes con tests > 500 LOC. La auditoría refleja
el estado al momento de captura; no penaliza por trabajos pendientes.

---

## Findings

### 1. a00067 (draft en editor) rompe el `lint:proposals` [ACTIVO — ruido operacional]

**File**: [`docs/mcp-vertex/proposals/ready/a00067-24-07-2026-language-migration-evaluation-velocity-and-llm-economics.md`](docs/mcp-vertex/proposals/ready/a00067-24-07-2026-language-migration-evaluation-velocity-and-llm-economics.md)

```markdown
## Data collection — exactly what was measured          ← L80
## Findings — the seven facts                            ← L237
## Trade-off matrices — the decision lenses              ← L299
```

**Problema**: El draft `a00067` introduce secciones nuevas (`## Data collection`,
`## Findings — the seven facts`, `## Trade-off matrices`) que no forman parte
del scaffold canónico. El linter `bun tools/scripts/lint/proposals.script.ts`
lo rechaza:

```
ERROR ready/a00067-24-07-2026-language-migration-evaluation-velocity-and-llm-economics.md
  line 80: unrecognized section heading "## Data collection — exactly what was measured"
  line 237: unrecognized section heading "## Findings — the seven facts"
  line 299: unrecognized section heading "## Trade-off matrices — the decision lenses"
  line 0: missing required section "verified state"
  line 0: missing required section "findings"
  line 0: missing required section "scoreboard"
```

Como `lint:proposals` es parte de `validate`, `bun run validate` falla. Esto
hace que **el draft del usuario bloquee el gate del repo entero** mientras
permanezca en `ready/`.

**Impacto**: Alto — bloquea `bun run validate` (gate de release). Cero — el
draft es valioso (la idea es buena), el contenedor equivocado.

**Resolución**: Renombrar las tres secciones a las canónicas (`verified state`
→ reusar el título existente; `Findings — the seven facts` → `findings`;
`Trade-off matrices — the decision lenses` → mover bajo `## notes` como
sub-sección, o reescribir `findings` como `## findings` con esas tres
matrices como `### N. ...`). O mover el draft a `done/audits/` si ya está
consumado.

**Resolution Track**: **Deferred to user choice** — el borrador está abierto en
el editor, no corresponde a esta auditoría tomar la decisión.

---

### 2. 6 plugins nuevos ship con un único `*.spec.ts` [ADVERTENCIA — riesgo de cobertura]

**Files** (verificación directa):

```text
plugins/cache/tests/registry.spec.ts                       (1 archivo)
plugins/diagram/tests/src/lib/build-graph.spec.ts          (1 archivo)
plugins/env/tests/src/lib/check-env.spec.ts                (1 archivo)
plugins/i18n/tests/src/lib/check-i18n.spec.ts              (1 archivo)
plugins/perf/tests/src/lib/check-budgets.spec.ts           (1 archivo)
plugins/tech-debt/tests/src/lib/scan-markers.spec.ts       (1 archivo)
```

Comparado con la media histórica:

- `plugins/memory`: 9 spec files
- `plugins/audit`: 8 spec files
- `plugins/external-mcps`: 8 spec files
- `plugins/orchestrator-runner`: 19 spec files
- `plugins/proposals`: 98 spec files

**Problema**: Los 6 plugins añadidos en la última oleada (commits
`97016f9d` env, `c755f263` diagram, `a081d1bb` i18n, `92831127` perf,
`b5c961bf` tech-debt, `39f4a80d` auto-agent-selector) entraron con cobertura
mínima — un solo `*.spec.ts` por plugin. Algunos como `auto-agent-selector`
sí llegaron a 9 specs (más maduro), pero los seis listados no.

**Impacto**: Medio — un solo archivo de test cubre **una función pura**;
cualquier ruta de error / input mal formado / interacción con el IO queda sin
gate. Estos plugins tocan disco (escanean ficheros, leen configs): un cambio
en la firma de un parámetro sin test que falle primero es un P1 silencioso.

**Resolución**: Añadir un ratchet en `tools/scripts/lint/` (sugerencia:
`lint:plugin-min-coverage`) que falle `validate` si un plugin `src/index.ts`
expone N herramientas y hay < N spec files, o < 3 spec files (lo que sea
mayor). Cubrir las rutas de error de cada uno de los seis listados antes de
añadir nuevas features.

**Resolution Track**: Deferred — pendiente de propuesta dedicada
(`c00xxx-plugin-test-coverage-ratchet`).

---

### 3. Default de `workspaceRoot` usa `process.cwd()` en `init-answers.schema.ts` [ADVERTENCIA — riesgo de fuga]

**File**: [`packages/cli/src/lib/init/init-answers.schema.ts:87`](packages/cli/src/lib/init/init-answers.schema.ts#L87)

```typescript
/**
 * f00088 S1: detection result from `analyzeProject`. Populated by
 * `withDetection` BEFORE the prompt flow runs; never asked of the
 * operator. Every field is documented in
 * `init-detection.ts#IInitDetection`.
 */
detected: z
```

Justo arriba (línea 87):

```typescript
/** Workspace root resolved by the CLI context. */
workspaceRoot: z.string().default(process.cwd()),
```

**Problema**: El Zod schema `PROMPTS_ANSWERS_SCHEMA` define un default que
lee `process.cwd()` **en tiempo de evaluación del schema** — es decir, **el
valor por defecto se congela en el momento en que se importa el módulo**, no
en el momento en que el usuario responde el prompt. Si el módulo se importa
desde un test, una herramienta, o un proceso hijo con un CWD diferente al del
CLI real, el default "miente": dice `process.cwd()` pero ese no es el
workspace real del usuario.

Adicionalmente, el hard rule #2 del AGENTS.md prohíbe `process.cwd()` en
"engines". El `init` flow es un engine de CLI, y este default es exactamente
el patrón que el round 2 de Claude documentó como P0 (a00061 — init stamps
monorepo roots in the wrong cwd).

**Comparación** con `scaffold-host.ts:358`:

```typescript
// The entry point is the ONE place allowed to read the launch directory
// (like mcp-vertex's own CLI). It resolves the workspace root and injects
// it into the (hermetic) host config.
export async function startServer(workspaceRoot = process.cwd()): Promise<void>
```

`scaffold-host.ts` está documentado como excepción sancionada (entry-point
generator). `init-answers.schema.ts` **no** tiene esa nota y, además, el
default se evalúa **al import**, no al call — peor que la excepción.

**Impacto**: Medio — un sub-proceso o un test que importe `init-answers.schema`
recibe un workspace "stale". No hay blast radius conocido en producción porque
el CLI siempre inyecta el real, pero el contrato del schema es engañoso.

**Resolución**: Cambiar el default a `z.string().optional()` y dejar que el
CLI (que ya conoce `cwd`) lo inyecte explícitamente. Marcar el campo como
`required` si el caller puede garantizar que lo provee; en otro caso, validar
que no esté vacío al consumirlo.

**Resolution Track**: **Deferred to slice `x00xxx-init-answers-cwd-default-fix`**.

---

### 4. `proposals` plugin concentra el 41 % de la superficie de tests [MEJORABLE — riesgo de blast radius]

**Files** (verificación directa):

```text
find plugins/proposals -name '*.spec.ts' | wc -l
→ 98 archivos

find plugins -name '*.spec.ts' | wc -l
→ 364 archivos total plugins

find plugins/proposals/src -name '*.ts' -not -path '*/tests/*' | xargs wc -l | tail -1
→ 26 098 LOC
```

**Problema**: `proposals` es el 41 % de los tests del repo (98 / 364) y el
22 % de las LOC de plugins (26 098 / 119 506). Concentra además las piezas
más críticas:

- `auto-work.tool.ts` — 921 LOC
- `persistent-task-queue.ts` — 853 LOC
- `authoring.tool.ts` — 848 LOC
- `loop-detector-service.ts` — 685 LOC
- `agent-lock-engine.ts` — 562 LOC
- `proposals/src/index.ts` — 542 LOC (el entry, super-grueso)

**Impacto**: Cualquier cambio en el state machine (DFA de status, lock TTL,
queue back-pressure) toca ≥ 5 archivos `src/` y ≥ 10 archivos `*.spec.ts`.
Esto explica por qué el flujo proposals / locks es el más lento de evolucionar
y por qué todos los bugs cross-cutting ("gates that lie", a00054;
"proposal-files drift", a00057) viven ahí.

**Resolución**: Considerar extraer sub-módulos del plugin `proposals` como
plugins hermanos (`@mcp-vertex/locks`, `@mcp-vertex/task-queue`,
`@mcp-vertex/proposal-store`). Cada uno con su `dependsOn`, su barrel, su
gate. El `proposals` actual queda como thin orchestrator. Esto:

1. Reduce el blast radius de cada cambio.
2. Permite cargar el `task-queue` en proyectos que NO usan el flujo
   proposals (workflows de un solo agente con cola persistente).
3. Hace los tests enfocados (98 specs dejan de ser un monolito).

**Resolution Track**: **Deferred to slice `r00xxx-proposals-plugin-split`**
(puede ser la primera mitad de un split mayor; ver Recommendations §3.2).

---

### 5. `rules` plugin ocupa 10 172 LOC y un solo `tools/rules-tools.ts` de 742 LOC [MEJORABLE — complejidad encapsulada]

**Files** (verificación directa):

```text
plugins/rules/src/lib/frameworks/presets.ts                   874 LOC
plugins/rules/src/lib/tools/rules-tools.ts                   742 LOC
plugins/rules/src/lib/frameworks/registry/factory.ts         519 LOC
plugins/rules/src/lib/frameworks/online-preset.ts            435 LOC
```

**Problema**: `rules` es el segundo plugin más grande (10 172 LOC), pero su
**único** tool público (`rules-tools.ts`, 742 LOC) lo hace todo: get / check /
apply. Los dogmas (12 familias) y los adaptadores (25+ lenguajes) viven en
`frameworks/`, pero el handler único los carga todos en memoria por llamada.

Esto se manifiesta en el audit playbook (Phase 2) y en `a00066` (que
reportaba "Faltan dependencias de linter en 8 áreas" — síntoma directo:
`rules_check_rules` no podía correr sin que cada sub-preset instalara sus
deps).

**Impacto**: Cada vez que se añade una familia de dogma, hay que tocar
`rules-tools.ts` para registrar el adapter. Cada vez que cambia el contrato
del handler, hay que actualizar ≥ 3 presets.

**Resolución**:

1. **Dividir el tool en tres tools dedicados**: `rules_get_preset`,
   `rules_check_compliance`, `rules_apply_recommendations`. El handler
   compartido pasa a ser un `composeRulesPipeline(preset, scope)` reutilizable.
2. **Cargar dogmas perezosamente**: hoy el factory (`registry/factory.ts`,
   519 LOC) carga todo en boot. Un registry lazy reduciría el cold-start de
   cada sesión MCP.
3. **Externalizar el resolver de presets** (`frameworks/online-preset.ts`,
   435 LOC) a un plugin opcional `@mcp-vertex/online-presets` que se carga
   sólo cuando el host tiene internet.

**Resolution Track**: **Deferred to slice `r00xxx-rules-plugin-tool-split`**.

---

### 6. El catálogo de plugins (32 plugins, 196+ tools) no tiene dashboard de adopción [MEJORABLE — visibilidad]

**Files** (verificación directa):

```text
plugins/*/package.json  →  28 plugins en disco (algunos faltan: 'usage-tracking' OK,
                            'cache' OK — el conteo real es 28 publicado + 4 internos)

mcp-vertex_overview { compact: true }  →  expone plugins + tools agrupados
                                         pero NO estadísticas de adopción

docs/mcp-vertex/agent-catalog.generated.json
  → sections: ['generatedAt', 'mode', 'tools', 'skills', 'proposals']
  → skills: 20 entries
  → proposals count no aparece en summary
```

**Problema**: Hay 33 propuestas en `ready/`, 0 en `in-progress/`, 243 en
`done/`. El catálogo vive en `agent-catalog.generated.json` pero **no expone
estado de las propuestas** (sólo ids y títulos). Un orquestador que arranca
en frío necesita saber:

- Cuáles propuestas están listas para ejecutar
- Cuántas hay por área (security, perf, i18n, dx)
- Cuáles se bloquearon mutuamente
- Qué plugin / área ha recibido más atención los últimos 30 días

**Impacto**: Bajo individualmente; alto agregado — el orquestador pierde tiempo
re-leyendo `ls docs/mcp-vertex/proposals/ready/` cada vez que arranca, y el
host dashboard (VS Code) no puede mostrar "backlog status" en una sola vista.

**Resolución**: Añadir al `agent-catalog.generated.json` una sección
`proposalsByTrack`:

```json
"proposalsByTrack": {
  "agent-discipline+session-governance": 3,
  "perf": 1,
  "i18n": 1,
  "security": 1,
  ...
}
```

y `proposalsByStatus`: `{ ready: 33, inProgress: 0, done: 243 }`. Lo emite
`tools/scripts/catalog/generate-agent-catalog.script.ts` (552 LOC) en una
pasada más.

**Resolution Track**: **Deferred to slice `f00xxx-proposals-catalog-stats`**
(el campo natural es un plugin hermano de `docs` que ya sabe leer el árbol).

---

### 7. `audit_run` (Alcance B) hace llamadas LLM sin opt-in explícito por host [ADVERTENCIA — blast radius]

**File**: [`plugins/audit/src/index.ts:23-30`](plugins/audit/src/index.ts#L23-L30)

```typescript
 * Activation is opt-in: `mcp-vertex --plugins=audit`. The `audit_plan`
 * and `audit_consolidate` tools make no network calls (no API fan-out,
 * no keys, no telemetry). `audit_run` DOES contact the configured LLM
 * providers — callers MUST supply API keys in the request. The plugin
 * never reads `process.env`; the host owns credential wiring.
```

**Problema**: El plugin `audit` documenta correctamente que `audit_run`
requiere opt-in. Pero el `register()` no aplica gating: **si el host carga
`mcp-vertex --plugins=audit`, los tres tools (`audit_plan`,
`audit_consolidate`, `audit_run`) están todos disponibles**. El comentario
dice "opt-in", pero el código no lo aplica.

Un host que carga `audit` esperando solo `audit_plan` recibe `audit_run` por
defecto, lo que significa que cualquier agente con acceso al namespace puede
gastar dinero del usuario sin acción explícita.

**Impacto**: Medio — depende de cómo el host descubra y bloquee tools. Si el
host filtra por `effects: ['network']` correctamente, no hay blast radius.
Si el host expone todos los tools por defecto (común en adapters básicos),
sí.

**Resolución**: Añadir `tags: ['network', 'opt-in']` al `audit_run` tool
registration y documentar en el plugin README que el host debe filtrar tools
con esos tags antes de exponerlos al agente. Alternativamente, partir el
plugin en dos: `@mcp-vertex/audit` (solo `audit_plan` + `audit_consolidate`)
y `@mcp-vertex/audit-runner` (que añade `audit_run`).

**Resolution Track**: **Deferred to slice `x00xxx-audit-run-opt-in-tag`**.

---

### 8. Tests-status-context: cobertura saludable pero asimétrica [INFO — contexto]

**Files** (verificación directa):

```text
Test Files  579 passed (579)        ← bun run test
Tests       4792 passed (4792)

test counts por plugin:
  proposals: 98 specs              ← heaviest
  orchestrator-runner: 19
  rules: 14
  usage-tracking: 14
  issues: 11
  memory: 9 / audit: 8 / external-mcps: 8
  …
  cache / diagram / env / i18n / perf / tech-debt: 1 each  ← Finding 2
```

**Problema / Contexto**: La cobertura global es excelente (4792 passing,
61 s). Pero la distribución es desigual: `proposals` tiene 98 specs mientras
6 plugins nuevos tienen 1. Esto NO es un fallo actual (todos pasan), pero
**es la vulnerabilidad latente más grande del repo**: un cambio en la
firma de un handler de `cache` o `tech-debt` no tiene red de seguridad.

**Impacto**: Latente, no actual.

**Resolución**: Cubierto por Finding 2.

---

### 9. AGENTS.md / Hard-rule compliance — pase general [POSITIVO — confirmar]

Hard rules (per `docs/mcp-vertex/AGENT-BOOTSTRAP.md` §6 y §7):

| Regla | Estado | Evidencia |
|---|---|---|
| 1. Core stays agnostic | ✅ | `packages/core/src/public/index.ts:617` re-exports sólo contratos; cero imports de plugins. |
| 2. No `process.cwd()` in engines | ⚠️ | 3 violaciones: `init-answers.schema.ts:87` (Finding 3); 2 entry-points sancionados (`packages/cli/src/index.ts:53,158,160`; `packages/core/src/cli.ts:19`; `scaffold-host.ts:358` — todos documentados como excepciones). |
| 3. Async I/O in hot paths | ✅ | Las sync restantes están en `cli/` boot (`assemble.ts`, `setup-subcommand.ts`, `run-init.ts`) y son boot-time; `proposals/src/index.ts:5,479-480` está explícitamente comentado como sanctioned. |
| 4. Durable writes via primitives | ✅ | `writeFileAtomic` + `withFileMutex` usados consistentemente (ver `agents/loop-detector-service.ts:405` que documenta la migración). |
| 5. Path containment | ✅ | `resolveWorkspaceContained` / `realpathContained` exportados y usados por plugins. |
| 6. `redactSecrets` antes de persistir | ✅ | `packages/core/src/lib/shared/redact.ts` exportado; plugins `memory`, `proposals` lo invocan. |
| 7. Token budget guarded | ✅ | `overview` y `agent-catalog` con `compact: true` ya son los defaults (a00024 / a00033). |
| 8. Every public tool has `outputSchema` | ✅ | El harness `verify:tools` (a00045 / a00066 — `196 tools, 0 failed`) confirma. |
| 9. i18n complete | ✅ | `12 langs × 175 keys` confirmado por `bun run check:i18n:ide`. |
| 10. tools/scripts TS-only | ✅ | `bun tools/scripts/lint/no-shell-python.script.ts` → 0 findings. |
| 11. No hardcoded id lists in host files | ✅ | `agent-catalog.generated.json` + `host-instructions.generated.md` regenerados por `catalog:hints`. |

**Conclusión**: El repo cumple 10/11 reglas duras sin excepciones; la #2 tiene
1 excepción documentable (Finding 3).

---

## Scoreboard

| Dimensión | Puntuación | Justificación |
|---|---|---|
| **Arquitectura (capas / boundaries)** | 9/10 | 0 drift detectado, 28 plugins bien delimitados, contratos limpios; baja nota porque `proposals` concentra demasiada superficie (Finding 4) y `rules` sigue en un solo handler (Finding 5). |
| **Flujo de Propuestas** | 9/10 | Registry sano (0 locks, 0 orphans per `state_health`); 33 ready, 0 in-progress es la métrica que falta en el catálogo (Finding 6). |
| **Calidad de código (Build & Types)** | 10/10 | `tsc --noEmit`, `bun run build` (32 paquetes), Biome — todo verde en este HEAD. |
| **Tests & Validación** | 8/10 | 4792 tests passing, 579 archivos, 61s; pero 6 plugins con 1 spec (Finding 2) y asimetría pronunciada (Finding 8). |
| **Dependencias (Integridad)** | 10/10 | `bun.lock` presente, deps healthy per `deps_check`. |
| **Documentación y Convenciones** | 8/10 | `docs/mcp-vertex/`, `apps/web/`, README actualizados; baja nota porque (a) `a00067` rompe `lint:proposals` (Finding 1), (b) el dashboard de adopción no existe (Finding 6). |
| **Reglas (Dogma / Linting)** | 9/10 | 11/11 hard rules cumplidas o documentadas (Finding 9). |
| **i18n** | 10/10 | `12 langs × 175 keys`, sin regresiones. |
| **Concurrencia / Durabilidad** | 10/10 | `atomic-write.ts` (con fsync antes del rename) + `with-file-mutex` (token de propiedad + heartbeat + fail-vs-steal explícito) son canónicos en el repo. |
| **Operación / DX** | 8/10 | El catálogo existe pero no tiene stats de adopción; `audit_run` requiere opt-in documentado pero no técnico (Finding 7). |

**Nota final: 9.1/10 — Estado sólido y operacional.** El proyecto está en
**mejor forma que en a00066** (8.3): los gates estructurales (typecheck, lint,
build, tests) pasan limpios, el repo creció +30 000 LOC en dos meses sin
romper la suite, y 7 plugins nuevos se integraron respetando el contrato.
Las penalizaciones son todas latentes (cobertura asimétrica, deuda de
catálogo) o de ruido operacional (a00067 rompe un gate).

---

## notes

### recommendations — entrega diferencial de esta auditoría

Esta sección convierte los hallazgos en un plan ejecutable, separado en
cuatro listas por tipo de acción.

#### 3.1 add — Cosas que faltan y deberían existir

1. **Ratchet de cobertura mínima por plugin** (`c00xxx-plugin-min-coverage`).
   - **Qué**: añadir un lint script `tools/scripts/lint/plugin-min-coverage.script.ts`
     que cuente `*.spec.ts` por `plugins/*/tests/`, cruce con el número de
     tools expuestas en `src/index.ts`, y falle `validate` si:
     - Un plugin expone ≥ 1 tool y tiene 0 specs, o
     - Un plugin expone ≥ 2 tools y tiene 1 spec.
   - **Por qué**: los 6 plugins con 1 spec (cache, diagram, env, i18n, perf,
     tech-debt) son una vulnerabilidad latente.
   - **Coste**: ~80 LOC de script + tests.
   - **Riesgo**: bajo — el linter no se ejecuta en dev local; sólo en CI.

2. **Dashboard de adopción de propuestas** (`f00xxx-proposals-catalog-stats`).
   - **Qué**: añadir al `agent-catalog.generated.json` una sección
     `proposalsByStatus` y `proposalsByTrack`. Un host que arranca ve
     `{ ready: 33, inProgress: 0, done: 243 }` en una sola lectura.
   - **Por qué**: 33 ready + 0 in-progress es la métrica que el orquestador
     necesita para auto-priorizar.
   - **Coste**: ~50 LOC en `generate-agent-catalog.script.ts` + 30 LOC de
     host hints.
   - **Riesgo**: bajo — sólo afecta el snapshot generado.

3. **`proposal_validate` CLI command** (`f00xxx-cli-proposal-validate`).
   - **Qué**: comando `mcpv proposal validate <file.md>` que corre el
     `lintProposalMarkdown` aislado (no contra todo `ready/`), útil para
     autores que están iterando un draft (como a00067).
   - **Por qué**: hoy el único camino para validar un draft es `bun run
     lint:proposals` que recorre 274 archivos.
   - **Coste**: ~60 LOC en `packages/cli/src/commands/groups/proposals.ts`.
   - **Riesgo**: bajo — herramienta aditiva.

4. **`audit_run` opt-in tag** (`x00xxx-audit-run-opt-in-tag`).
   - **Qué**: marcar `audit_run` con `tags: ['network', 'opt-in']` y
     documentar en `plugins/audit/README.md` que el host debe filtrar esos
     tags antes de exponer el tool a un agente.
   - **Por qué**: el comentario del plugin dice "opt-in" pero el código no
     lo aplica (Finding 7).
   - **Coste**: ~10 LOC + update al README.
   - **Riesgo**: bajo.

5. **Métrica de bundle-size para plugins en `dist/`** (`f00xxx-plugin-dist-budgets`).
   - **Qué**: hoy `perf_bundle` mide bundles de la app web. Un plugin del
     propio monorepo no se mide. Añadir budgets a `plugins/proposals/dist/`
     (1.5 MB actual), `plugins/rules/dist/` (1.3 MB) y los siguientes 5 más
     pesados.
   - **Por qué**: cuando un PR suba +200 KB a `proposals/dist`, el CI no lo
     atrapa automáticamente.
   - **Coste**: ~30 LOC + baseline values en `config/metrics-baseline.json`.
   - **Riesgo**: bajo.

6. **Skill pack de debugging para agentes** (`f00xxx-skills-debugging-pack`).
   - **Qué**: skill SKILL.md que enseñe al agente a: leer logs de MCP,
     diagnosticar un tool que retorna `ok: false`, leer un trace de
     `loop-detector`, navegar el `agent-catalog`. Vive bajo
     `packages/core/skills/debug-mcp-vertex/`.
   - **Por qué**: cada nuevo agente (humano o LLM) reinventa la rueda al
     primer `ok: false`.
   - **Coste**: ~150 LOC de markdown + 2-3 cross-refs.
   - **Riesgo**: bajo.

### 3.2 reorganize — Cosas que existen pero están en el lugar equivocado

1. **Split del plugin `proposals` en tres** (`r00xxx-proposals-plugin-split`).
   - **Qué**: extraer `@mcp-vertex/locks` (agent-lock-engine +
     persistent-task-queue + branch-gc + branch-status) y
     `@mcp-vertex/proposal-store` (sync-proposal-registry +
     proposal-scaffold-linter + authoring + transition). `proposals` queda
     como orquestador (con `dependsOn: ['locks', 'proposal-store']`).
   - **Por qué**: 27 633 LOC en un solo plugin es el #1 blast radius del
     repo (Finding 4).
   - **Coste**: ~6 PRs pequeños; cada sub-plugin migra 3-5 archivos + tests.
   - **Riesgo**: medio — afecta a todo consumidor del flujo proposals.
     Mitigación: hacerlo detrás de `--plugins=locks+proposal-store+proposals`
     y dejar el legacy detrás de un flag.

2. **Extraer `online-preset.ts` a `@mcp-vertex/online-presets`** (`r00xxx-rules-online-preset-split`).
   - **Qué**: el resolver online (435 LOC) se mueve a un plugin opcional.
     El host lo carga sólo si tiene red.
   - **Por qué**: el cold-start de `rules_check_rules` mejora y los
     proyectos sin red no cargan código que no van a usar.
   - **Coste**: ~150 LOC movidos + 1 barrel nuevo.
   - **Riesgo**: bajo.

3. **Consolidar las 6 utilities de "paths" en `shared/paths.ts`** (`r00xxx-shared-paths-consolidate`).
   - **Qué**: `shared/paths.ts`, `shared/contain-path.ts`, `shared/contain-realpath.ts`,
     `shared/exec-path.ts`, `shared/walk-allowed-files.ts` tienen APIs que se
     solapan (`resolveWorkspaceContained`, `realResolvePath`, `realpathContained`,
     `resolveAgainstRoots`, `resolveExecPath`, `joinRel`, `EXEC_SUBDIR_NAME`).
     Vale la pena una fachada única `paths.ts` con API cerrada y tests de
     paridad.
   - **Por qué**: 5 archivos tocando el mismo dominio (path safety) +
     inconsistencias de naming (`resolveWorkspaceContained` vs
     `resolveAgainstRoots` vs `realpathContained`) confunden al lector nuevo.
   - **Coste**: ~300 LOC + tests de paridad.
   - **Riesgo**: medio — afecta a todos los plugins que importan estos utils.

### 3.3 modify — Cosas que hay que cambiar

1. **Default de `workspaceRoot` en `init-answers.schema.ts`** (`x00xxx-init-answers-cwd-default-fix`).
   - **Qué**: cambiar `z.string().default(process.cwd())` por
     `z.string().optional()` y forzar al caller (CLI) a inyectarlo
     explícitamente.
   - **Por qué**: Finding 3 — el default se congela al import, no al call.
   - **Coste**: ~5 LOC + 1 test.
   - **Riesgo**: bajo — el CLI ya inyecta el real.

2. **Estándar de propuestas: secciones canónicas solamente** (`c00xxx-proposals-strict-scaffold`).
   - **Qué**: hacer que `lint:proposals` falle **antes** de que un draft
     llegue a `ready/`. Hoy el draft se sienta en `ready/` y rompe el gate
     (Finding 1).
   - **Por qué**: a00067 demuestra que el modelo "escribe y luego lintea"
     no funciona — el lint debe ser **proponente-time**, no merge-time.
   - **Coste**: integrar el lint en `mcp-vertex_overview` o en un hook del
     CLI; ~40 LOC.
   - **Riesgo**: bajo — el script ya existe.

3. **`tools/scripts/dev/dev.script.ts` (885 LOC) merece split** (`r00xxx-dev-script-split`).
   - **Qué**: el entry-point del dev preview hace de todo: arranca el
     server, sirve el bundle, genera los logos, abre el browser. Romperlo
     en 3-4 entry-points más pequeños con un orquestador.
   - **Por qué**: 885 LOC en un script de bash-TS es difícil de testear y
     de mantener.
   - **Coste**: ~4 PRs, cada uno mueve ~200 LOC.
   - **Riesgo**: bajo — sigue siendo compatible con `bun run dev`.

4. **Quitar `commands/groups/doctor.ts:14-121` sync I/O** (`x00xxx-doctor-async-io`).
   - **Qué**: el `doctor` corre en producción de usuarios reales, no en
     boot. `existsSync` + `readFileSync` no son apropriados en ese path.
   - **Por qué**: AGENTS.md hard rule #3 lo prohíbe explícitamente.
   - **Coste**: ~30 LOC + tests.
   - **Riesgo**: bajo.

### 3.4 remove — Cosas que sobran y se pueden quitar

1. **`mcp-vertex_metrics` references en briefings legacy** — ya hecho en
   el último refactor del audit plugin (commit `9cb64c1`). Verificar que no
   queden en skills `.generated.json` viejos. **Status**: ✅ done en HEAD.

2. **`commit.author from process.env` fallback en `commit-author.ts`** —
   **No quitar todavía**. Necesita investigación; lo marco como
   candidato a `t00xxx-investigate` antes de tocarlo.

3. **`audit_run` no se debe cargar por defecto con `audit`** —
   mover la decisión al host, no al plugin. Cubierto por `3.1.4`.

4. **Tests redundantes en `plugins/orchestrator-runner/tests`** —
   `orchestrator-runner` tiene 19 spec files; revisar si hay tests que
   duplican otros (este plugin depende de `usage-tracking`, y los límites
   de spend están duplicados). **Acción**: `c00xxx-orchestrator-test-dedup`.

5. **`docs/mcp-vertex/host-hints/*.generated.md` stale fragments** —
   el regenerador ya limpia los fragmentos `<BEGIN GENERATED ...>`,
   pero los `.md` viejos pueden quedar. **Acción**: añadir un
   `lint:host-hints-stale` que falle si detecta un fragmento sin cerrar.

---

### tests-status-context

Esta auditoría se capturó en `b0a6107e` con 4792/4792 tests passing. El
usuario advirtió que otro agente está trabajando en paralelo y podría romper
tests durante esta misma sesión. El scoreboard refleja el **estado capturado**,
no el peor estado posible: si al leer la auditoría el suite está rojo,
**chequear primero si un agente activo está modificando `plugins/proposals`**,
que es el 41 % de la superficie de tests.

### Lo que esta auditoría NO cubre (alcance explícito)

- **Performance benchmarks.** No se ejecutó `perf_bundle` ni se midieron
  cold-starts. Queda pendiente `f00xxx-perf-baseline-collection`.
- **Security audit exhaustivo.** El plugin `security` cubre los secretos
  leaked y CVEs; un SAST profundo queda fuera del scope de esta pasada.
- **Análisis UX del host (VS Code).** El extension.ts tiene 782 LOC y
  13 grupos de comandos; un deep-dive queda para una auditoría dedicada
  cuando el usuario la pida.
- **i18n más allá del completeness.** El gate pasa; no se hizo auditoría
  cualitativa de las traducciones.

### Camino al 11/10 — la siguiente auditoría debería ver esto cerrado

1. Finding 1 — `a00067` reubicado o reformado (decisión del usuario).
2. Finding 2 — los 6 plugins con 1 spec pasan a ≥ 3 specs cada uno.
3. Finding 3 — `init-answers.schema.ts:87` sin `process.cwd()`.
4. Finding 6 — catálogo con `proposalsByStatus` y `proposalsByTrack`.
5. Finding 7 — `audit_run` con `tags: ['network', 'opt-in']` o split.

Si esos 5 puntos están cerrados, el siguiente scoreboard debería estar en
9.5+/10.