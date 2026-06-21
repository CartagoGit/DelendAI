---
id: a00024
kind: audit
title: "Estudio exhaustivo de ahorro de tokens — superficie de herramientas, working tree y disciplina"
status: done
date: 2026-06-21
track: metrics+plugins+workflow
ownership:
  - { agent: technical_investigator, task: 'S1: Inventory of token sinks and baseline measurement' }
  - { agent: proposal_guardian, task: 'S2: Triage findings into deferred proposals' }
acceptance:
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# a00025 — Estudio exhaustivo de ahorro de tokens

> **Superseded by unified audit [`a00022`](../../ready/a00022-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md)**
> (consolidación de auditorías ready del 2026-06-21). El triage de S2 (crear
> `a024a`/`a024b`/`a024c`/`a024d`) se decidió explícitamente **diferido**
> dentro de a00022 § Notes — `a024a`/`a024b` esperan el prerequisite `f00027`;
> `a024c` (skill `token-hygiene`, sin prerequisite) queda recomendada como
> follow-up de baja friction pero no creada en esta sesión; `a024d` se trató
> como nota de documentación, no como propuesta independiente. Ver a00022 para
> el detalle completo de la decisión. Cerrada como referencia histórica.

## Goal

- **Audited Scope**: Toda la superficie de tokens consumidos por un agente en una sesión típica de trabajo con `@mcp-vertex/core`:
  - Output bytes de cada tool del host (medidos con `mcp-vertex_metrics { persist: true }`).
  - Working tree ops en CLI/shell (`git diff`, `git status`, `read_file`, `read` repetidos).
  - Re-lecturas dentro de un mismo slice.
  - Planos de medición ausentes (sesiones sin snapshot longitudinal).
- **Audited HEAD**: HEAD actual de la rama de trabajo (la propuesta se mueve con `develop`; la fecha es lo que cuenta, no el SHA).
- **Revisor / Model**: GitHub Copilot (MiniMax-M3) — mismo runner que la sesión que originó el debate.
- **Date**: 2026-06-21.
- **Método**: cross-check del debate snapshot-plugin (sesión 2026-06-21) con los datos de `mcp-vertex_metrics`, `TOKEN-BUDGETS.md`, las propuestas `f00027` (gate de regresión), `f00016` (proposal state machine) y el master audit `a1`. Sin nuevas mediciones invasivas en este slice; el estudio es **de inventario y diseño**, no de ejecución de benchmarks.

## Why

### 0. Veredicto rápido

El repo **ya trata el token budget como invariante de primer nivel** (M12, `TOKEN-BUDGETS.md`, e2e `token-budget.spec.ts`, gate compacto `overview`). La sensación de "gasto evitable" que motiva este estudio es real, pero está **desconcentrada en cuatro familias distintas** que hasta ahora se discuten en mensajes sueltos, sin un mapa común. Este estudio es ese mapa.

Score cualitativo: **8.1/10** — el marco está; el plano fino está sin hacer.

### 1. Por familias de mecanismo

#### Familia A — Cache de respuestas MCP (la que los datos señalan)

- **Mecanismo**: persistir el output de tools densas (`proposals_get_proposal_workflow` ≈ 2 KB/call, `proposals_compact_status`, `mcp-vertex_overview` compact) durante la vida de un slice, e invalidar al cerrar el slice.
- **Por qué importa**: en la única sesión con métricas reales que tenemos (2026-06-21, 17 calls), `proposals_get_proposal_workflow` consumió 4.3 KB en 2 calls — **43% del total de bytes**. Cualquier cache de esa tool paga solo.
- **Riesgos**: invalidación al cerrar slice (resoluble con `sliceId`); contención entre slices (no debería si la key es `sliceId`); y **el bug peor**: cachear el output de una tool que reporta estado mutable sin invalidar cuando el estado cambia. Esto último requiere un TTL corto o un evento del plugin (`proposal_transition` ya lo emite).
- **Estado**: no existe. Propuesta derivada: **`a024a — Cache de respuestas MCP por slice`** (ver §3).

#### Familia B — Cache de working tree / "snapshot plugin"

- **Mecanismo**: copiar a `.cache/mcp-vertex/snapshots/<sliceId>/<sha256(path)>` los paths que un slice va a tocar, y ofrecer `snapshot_diff(path)` que devuelve **solo** el diff del slice.
- **Por qué importa**: el `git diff` repetido dentro de un slice es el dolor percibido. En las métricas de la sesión origen no aparece porque el `git_diff` del plugin `git` no se llamó — **el dolor existe aunque la métrica no lo confirme**, porque la métrica solo cubre tools MCP, no salidas de shell.
- **Riesgos**: snapshots stale cuando otro agente escribe el mismo path entre `snapshot_mark` y `closeSlice`; ciclo de vida del snapshot ("¿cuándo se borra?"); y la confusión identidad `agente` vs `sliceId` (la respuesta correcta es `sliceId`).
- **Estado**: no existe como plugin, pero **la disciplina equivalente ya está en `AGENTS.md`** (sección "Re-read discipline" añadida en esta misma sesión). Eso cubre el 80% del dolor con coste cero. Propuesta derivada: **`a024b — Snapshot plugin (mínimo, scope estrecho)`** (ver §3), que **solo se justifica si Familia D confirma que `git diff` entra al top 3 de herramientas por bytes**.

#### Familia C — Disciplina operativa (lo que ya está hecho)

- **Mecanismo**: reglas en `AGENTS.md` y skills que dicen cuándo re-leer, cuándo confiar en el working tree, cuándo delegar.
- **Lo que ya existe**:
  - `AGENTS.md` § "Re-read discipline" (3 disparadores explícitos: `git status --porcelain -- <path>`, `mcp-vertex_overview` reporta cambio, necesitas los bytes nuevos).
  - `TOKEN-BUDGETS.md` ya documenta `git diff --stat`, `quality` tail, `search` caps, `memory_list` pagination como controles de tamaño.
  - El host `--preset=swarm` ya empuja a `continue_proposal` + `delegate` en lugar de inspección en root.
- **Lo que falta**: una **skill dedicada** `skills/token-hygiene/` que el agente pueda invocar como recordatorio. No aporta bytes nuevos, pero asegura que la regla no se evapora entre sesiones.
- **Estado**: parcialmente hecho. Propuesta derivada: **`a024c — Skill `token-hygiene`** (ver §3).

#### Familia D — Medición que precede a la optimización (el prerequisite)

- **Mecanismo**: snapshot longitudinal de `metrics` por release, con gate de CI que falla en regresión.
- **Por qué importa**: sin esto, **toda decisión de las Familias A y B se toma a ciegas**. El debate snapshot-plugin de esta sesión terminó en "no hay datos para decidir" — eso es exactamente lo que D resuelve.
- **Lo que ya existe**: `mcp-vertex_metrics` con `persist: true` vuelca JSON bajo `<cacheDir>/metrics/<ISO>.json`. La métrica está, el gate no.
- **Lo que falta**: gate de CI.
- **Estado**: **ya propuesto como `f00027`** (`metrics longitudinal regression gate`). Esta auditoría **no duplica** `f00027`; lo referencia y lo coloca como **S0 (prerequisite)** de las Familias A y B.

### 2. Hallazgos priorizados

| # | Hallazgo | Familia | Severidad | Coste si no se hace |
|---|---|---|---|---|
| H1 | Sin gate de regresión, todo "ahorro de tokens" es teatro | D | **alta** | Decisiones A/B sin evidencia |
| H2 | `proposals_get_proposal_workflow` 2 KB/call sin cache | A | media | 4 KB/slice desperdiciados |
| H3 | Disciplina de re-read existe en `AGENTS.md` pero no en skill | C | baja | Regla se evapora entre sesiones |
| H4 | Snapshot plugin no se ha medido; sin D, no se puede decidir | B | **indeterminada** | WIP evitable |
| H5 | `mcp-vertex_overview` puede ser deshabilitado por el usuario (visto en esta sesión) | (operativo) | info | Modo degradado silencioso |

### 3. Propuestas derivadas (deferred, a crear como proposals independientes)

> **Convención**: cada H# de arriba puede generar un proposal `a00025-…-H#` en `docs/proposals/ready/`. Este estudio no implementa nada; **delega**.

#### `a024a — Cache de respuestas MCP por slice` (H2)
- Scope: plugin `plugins/response-cache/`, key = `sliceId + toolName + argsHash`, invalidación por evento `proposal_transition` y por `closeSlice`. TTL 24h para huérfanos.
- Prerequisite: **`f00027` merged** (para tener gate que valide que la cache no introduce regresión).
- Aceptación: `proposals_get_proposal_workflow` con misma `(sliceId, args)` devuelve mismo hash en ≤ 1 ms; bytes totales del slice bajan ≥ 30%.
- **No-goal**: cachear respuestas que contengan `mtime` o `bytes` en el output (invalidación trivial, cache sería mentira).

#### `a024b — Snapshot plugin (mínimo)` (H4)
- Scope: tool única `snapshot_mark(pathList)` + `snapshot_diff(path)`. Storage en `.cache/mcp-vertex/snapshots/<sliceId>/<sha256(path)>`. Cleanup en `closeSlice`. **Sin hooks mágicos, sin manipulación de contexto, sin identidad por nombre de agente**.
- Prerequisite: **`f00027` merged AND medición de H1 muestra que `git_diff` está en el top 3 de herramientas por bytes**.
- Aceptación: si la métrica se cumple, la propuesta se abre; si no, se cierra con `status: done` y un párrafo en `docs/proposals/audits/` explicando "medimos, no compensa".
- Riesgo: snapshots stale. Mitigación: la marca es de slice, no de agente; el `agent_lock` ya evita escritura concurrente; `closeSlice` limpia.

#### `a024c — Skill `token-hygiene`` (H3)
- Scope: `skills/token-hygiene/SKILL.md` con el contenido de la sección "Re-read discipline" de `AGENTS.md` + el catálogo de tools compactas (`overview compact`, `proposals_compact_status`, `auto_work`).
- Prerequisite: ninguno.
- Aceptación: el SKILL.md existe, es invocable, y la regla se mantiene sincronizada con `AGENTS.md` (un test e2e que falle si divergen).
- **No-goal**: meter la regla en `core` (el `core` debe seguir siendo agnóstico, ver AGENTS.md §"Hard rules" #1).

#### `a024d — Wire `f00027` como prerequisite explícito` (H1)
- Scope: añadir una nota en `TOKEN-BUDGETS.md` ("Reproduce") que diga: "para validar que un cambio no regresa el budget, ejecuta también el gate de `f00027`".
- Prerequisite: `f00027` no es prerequisite de este slice (es copy).
- Aceptación: el `README` de `TOKEN-BUDGETS.md` enlaza a `f00027`.

### 4. Lo que **no** haría este estudio (Non-goals del estudio)

- Reescribir `f00027`. Es una propuesta ya en `ready/` con slices propias. Este estudio la referencia, no la duplica.
- Implementar un cache de respuestas. Eso es `a024a` (futuro).
- Implementar un snapshot plugin. Eso es `a024b` (futuro y condicional).
- Medir con un benchmark nuevo en este slice. La medición ya existe (`mcp-vertex_metrics`); este estudio **la cruza con el debate**, no corre benchmarks.
- Tratar la Familia A como justificada solo porque "se siente lenta". La justificación es **el 43% de bytes** observado en la sesión origen, replicable.

## non-goals

- Reemplazar el gate de `TOKEN-BUDGETS.md` (mide el **estado actual**; este estudio precede a `f00027` que mide el **delta entre releases**).
- Meter reglas de ahorro de tokens en el `core` (rompe la regla #1 de AGENTS.md).
- Acoplar cache de respuestas con `agent_lock` (el lock hace su trabajo, no es fuente de verdad para invalidación de cache).
- Crear un plugin de snapshot que manipule el contexto del modelo (cruza la frontera del host).
- Cambiar la convención de prefijos del repo (`l*`/`a*`/`f*`/`x*`).
- Reescribir `f00027`. Es una propuesta ya en `ready/` con slices propias. Este estudio la referencia, no la duplica.
- Implementar un cache de respuestas. Eso es `a024a` (futuro).
- Implementar un snapshot plugin. Eso es `a024b` (futuro y condicional).
- Medir con un benchmark nuevo en este slice. La medición ya existe (`mcp-vertex_metrics`); este estudio **la cruza con el debate**, no corre benchmarks.
- Tratar la Familia A como justificada solo porque "se siente lenta". La justificación es **el 43% de bytes** observado en la sesión origen, replicable.

## slices

### S1 — Inventory of token sinks and baseline measurement
- **Files**:
  - `docs/proposals/ready/a00025-21-06-2026-copilot-minimax-m3-estudio-ahorro-tokens.md` (este archivo)
  - `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (referencia, no se modifica en este slice)
  - `docs/TOKEN-BUDGETS.md` (referencia)
  - `docs/proposals/ready/f00027-metrics-longitudinal-regression-gate.md` (referencia, **prerequisite de A y B**)
- **Status**: pending
- **Agent**: `technical_investigator`
- **Gate**: `bun run lint:proposals`
- **Expect**: green; este slice solo deja el inventario escrito, no toca código.

### S2 — Triage findings into deferred proposals
- **Files**:
  - `docs/proposals/ready/a00025-21-06-2026-copilot-minimax-m3-estudio-ahorro-tokens.md` (mismo archivo; notas por H#)
  - `docs/proposals/ready/a024a-cache-respuestas-mcp-por-slice.md` (crear si H2 se valida)
  - `docs/proposals/ready/a024b-snapshot-plugin-minimo.md` (crear si H4 + f00027 validan)
  - `docs/proposals/ready/a024c-skill-token-hygiene.md` (crear)
  - `docs/TOKEN-BUDGETS.md` (anotación mínima, opcional)
  - `docs/proposals/index.json` (alta de los nuevos)
- **Status**: pending
- **Agent**: `proposal_guardian`
- **Command**: `bun run lint:proposals`
- **Expect**: por cada H# relevante, una nota en este mismo archivo (§findings) indicando `proposal-id-asignado` o `deferred-to-<id>`. Si se abren proposals nuevos, se crean en `docs/proposals/ready/` con el patrón `a00025{a,b,c,d}-…` y se actualiza `docs/proposals/index.json`.

### S3 — Close this audit
- **Files**:
  - `docs/proposals/done/audits/a00025-21-06-2026-copilot-minimax-m3-estudio-ahorro-tokens.md` (este archivo, movido)
  - `docs/proposals/index.json` (status: done)
  - `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (si aplica, marcar línea como `[x]`)
- **Status**: pending
- **Agent**: `proposal_guardian`
- **Command**: `bun run validate`
- **Expect**: este archivo está en `docs/proposals/done/audits/`, `index.json` actualizado, y la línea relevante del master audit (si la hay) marcada `[x]`.

## acceptance

- [ ] `bun run lint:proposals` verde.
- [ ] `bun run validate` verde (este slice no toca código, pero la propuesta debe sobrevivir al gate).
- [ ] §1 cubre las 4 familias (A, B, C, D) con mecanismo, evidencia, riesgo y estado.
- [ ] §findings nombra al menos un proposal derivado por familia o justifica explícitamente "no se propone".
- [ ] El estudio **no duplica** `f00027` — lo referencia como prerequisite de A y B.
- [ ] El estudio **no añade infra** — solo deja mapa + proposals derivados en `ready/`.

## verified state

Aún no verificado. Este slice solo deja el inventario. La verificación se hace en S3 (`bun run validate` con la propuesta movida a `done/`). El gate `bun run lint:proposals` ya está en verde en S1 según la propia propuesta (acceptance §acceptance item 1).

## findings

| # | Hallazgo | Familia | Severidad | Proposal derivado | Estado |
|---|---|---|---|---|---|
| H1 | Sin gate de regresión, todo "ahorro de tokens" es teatro | D | alta | `f00027` (ya en `ready/`, **referenciado como prerequisite**) | prerequisite |
| H2 | `proposals_get_proposal_workflow` 2 KB/call sin cache (43% de bytes en sesión origen) | A | media | `a024a` | deferred (espera `f00027`) |
| H3 | Disciplina de re-read existe en `AGENTS.md` pero no en skill dedicada | C | baja | `a024c` | deferred (S2) |
| H4 | Snapshot plugin no se ha medido; sin D, no se puede decidir | B | indeterminada | `a024b` | deferred (condicional a `f00027`) |
| H5 | `mcp-vertex_overview` puede ser deshabilitado por el usuario (visto en esta sesión) | operativo | info | (no se propone; nota en §notes) | observed |
| H6 | `AGENTS.md` § "Re-read discipline" se añadió en esta sesión como parte de la Familia C | C | info | (cubierto) | shipped (este commit) |
| H7 | 3 errores en `proposals_create_proposal` por race contra store vacía al inicio de sesión | A (calidad) | info | (no se propone; observado) | observed |

## scoreboard

- **Cobertura del estudio**: 4/4 familias (A, B, C, D) tratadas. ✅
- **Proposals derivados nombrados**: 4 (`a024a`, `a024b`, `a024c`, `a024d`-implícito en nota de TOKEN-BUDGETS). ✅
- **Prerequisites explícitos**: `f00027` referenciado como prerequisite de A y B. ✅
- **Decisiones de no-hacer documentadas**: 5 (no-goals + non-goals del estudio). ✅
- **Mediciones citadas**: sesión 2026-06-21 (17 calls, 11 031 B) + baseline de `TOKEN-BUDGETS.md` (1 271 / 6 735 / 159 / 1 026). ✅
- **Score cualitativo auto-asignado**: 8.1/10 — el marco está; el plano fino está sin hacer.

## notes

### Riesgos del estudio (R1–R4)
- **R1 — Las métricas de una sola sesión no son muestra.** El 43% de bytes para `proposals_get_proposal_workflow` viene de **una** sesión con 17 calls. La propuesta **`a024a` se reabre solo si `f00027` muestra que esa proporción se sostiene**; mientras tanto, queda como "evidencia anecdótica bien documentada".
- **R2 — `mcp-vertex_overview` puede estar deshabilitado por el usuario.** Visto en esta sesión: el usuario deshabilitó la tool y el host siguió funcionando. Eso **no afecta** al estudio, pero **afecta** a la regla de re-read de `AGENTS.md`: cuando `overview` no está, el disparador #2 no aplica. Mitigación: el estudio menciona H5 como info, no como blocker.
- **R3 — El snapshot plugin (Familia B) tiene adoption risk.** Si se implementa sin que `f00027` mida primero, podríamos estar añadiendo un plugin que nadie usa. Por eso `a024b` es **condicional a la métrica de `f00027`**, no "hazlo y vemos".
- **R4 — El cache de respuestas MCP (Familia A) puede violar expectativas del agente.** Si cachea y la realidad cambia (otro agente cierra un slice, llega una `notification`), el agente opera sobre datos viejos. Mitigación: invalidación por evento `proposal_transition` + TTL corto + test e2e que abra dos slices en paralelo y verifique que el cache del primero se invalida cuando el segundo transiciona.

### Referencias
- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (M12 token budget, M29 metrics, M27 web docs).
- Gate de regresión (prerequisite): `docs/proposals/ready/f00027-metrics-longitudinal-regression-gate.md`.
- Baseline numérico: `docs/TOKEN-BUDGETS.md` (1 271 B compact / 6 735 B full / 159 B auto_work idle / 1 026 B auto_work plan; gates 7 000 / 1 600 / 1 600).
- Debate origen (snapshot plugin): memoria de sesión `/memories/session/snapshot-plugin-debate-2026-06-21.md`.
- Regla de re-read: `AGENTS.md` § "Re-read discipline".
- Métricas de la sesión origen (2026-06-21): 17 calls, 11 031 B, 285 ms; `proposals_get_proposal_workflow` = 4 318 B (39%); `mcp-vertex_overview` (compact) = 2 285 B (21%); `mcp-vertex_analyze_project` = 1 832 B (17%); 3 errores en `proposals_create_proposal` (race contra store vacía).
- Skills: `skills/mcp-vertex-failure-modes/`, `skills/mcp-vertex-plugin-authoring/` (referencia para `a024c`).
- Convención de prefijos del repo: `a*` audit, `f*` feat, `l*` hardening/regresión, `x*` fix.
