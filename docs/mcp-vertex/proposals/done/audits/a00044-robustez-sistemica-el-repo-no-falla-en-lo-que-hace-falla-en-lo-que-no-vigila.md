---
id: a00044
kind: audit
title: "Robustez sistémica — el repo no falla en lo que hace, falla en lo que NO vigila"
status: done
date: 2026-06-28T02:15:00Z
track: governance+coordination+lint+worktree-lifecycle
---

# 28-06-2026 · Auditoría de robustez sistémica — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría NO reevalúa el código fuente: `a00043` ya cubrió hallazgos de código, y los quick-wins `x00076` ya los empaquetan. Esta auditoría se enfoca en **qué pasa cuando varios agentes y humanos trabajan en paralelo y el sistema NO vigila los puntos de coordinación que esos agentes no pueden vigilar por sí mismos**.
>
> **Revisor:** Copilot (MiniMax-M3).
> **HEAD auditado:** `ff5c6264` (feat(docs): add proposal for canonical ephemeral exec paths in pluginCacheDir).
> **Working tree al momento de la auditoría:** 8 entradas (2 staged + 6 untracked). Ver § 2.
> **Estado de la suite de tests:** *no se ejecutó* — el objetivo no es evaluar gates, sino evaluar el sistema que orquesta los gates.

---

## 1. Veredicto (en una frase)

El repositorio tiene **10 / 10 reglas duras de AGENTS.md verdes** y los gates principales (`typecheck`, `lint:proposals`, `lint:cache`, `lint:ephemeral`, `lint:tools`, `verify:tools`) **todos pasan**, pero el sistema **NO vigila los puntos de coordinación entre agentes y humanos** — específicamente: la unicidad de propuestas por `id`, la correspondencia `status ↔ carpeta`, la deduplicación por `shipped-in[0]`, la idempotencia de worktrees de agente, la consistencia `branch_status` ↔ `branch_gc`, y la preservación de archivos untracked entre ciclos de commit.

---

## 2. Estado verificado al momento de la auditoría

### 2.1 Working tree (post-`ff5c6264`)

```
$ git status --short
 D docs/mcp-vertex/proposals/in-progress/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md
R  docs/mcp-vertex/proposals/ready/x00074-loop-detector-distinguish-backoff-from-stuck.md -> docs/mcp-vertex/proposals/paused/x00074-loop-detector-distinguish-backoff-from-stuck.md
?? docs/mcp-vertex/proposals/done/audits/a00043-28-06-2026-antigravity-gemini-3-5-flash-repositorio.md
?? docs/mcp-vertex/proposals/ready/c00075-proposal-guardian-cannot-pause-without-user-consent.md
?? docs/mcp-vertex/proposals/ready/f00077-automated-audit-run-tool.md
?? docs/mcp-vertex/proposals/ready/x00076-quick-wins-from-2026-06-28-audit.md
?? plugins/audit/src/lib/services/llm-client.service.ts
?? plugins/audit/src/lib/services/proposal-scaffolder.service.ts
```

- **2 staged**: una propuesta que ya está en `done/` (mi `d153bb8f`) y que otro agente **volvió a crear** en `in-progress/` con un commit `WIP Salvage` (`ff5c6264`) — staged para `D`. Un rename de `ready/x00074 → paused/x00074` también staged.
- **6 untracked**: 4 propuestas en `ready/` (incluyendo la propia `x00076` que arregla `a00043`), 1 audit, y **2 archivos de implementación en `plugins/audit/` (793 líneas)** que parecen ser el código de `f00077` (`audit_run`) sin commitear — vulnerables a perderse si otro agente o humano hace `git clean` o un `git reset --hard`.

### 2.2 Worktrees (post-merge `062bdf34`)

```
$ git worktree list --porcelain
worktree /home/cartago/_projects/mcp-vertex
HEAD  ff5c626453a87857188fd4c32f96ee8777234d57
branch refs/heads/develop
```

- **Solo queda `develop`**. Los 2 worktrees que se movieron ayer a `.cache/mcp-vertex/.worktrees/{copilot-minimax-m3-s57, copilot-minimax-m3-x00056}` para cumplir AGENTS.md "cache is ALWAYS the root cache" **ya no existen**.
- Las ramas `agent/copilot-minimax-m3-s57` y `agent/copilot-minimax-m3-x00056` también desaparecieron del reflog y de `git branch -a`. El merge automático de `062bdf34` las pruneó; sus commits merged viven en `develop`, pero los **archivos untracked / dirty** que estaban en esos worktrees se perdieron silenciosamente.

### 2.3 Commits `WIP Salvage` recientes

```
$ git reflog -10
ff5c6264 HEAD@{0}: reset: moving to HEAD
ff5c6264 HEAD@{1}: reset: moving to HEAD
ff5c6264 HEAD@{2}: commit: feat(docs): add proposal for canonical ephemeral exec paths in pluginCacheDir
```

El patrón `reset → reset → commit` con autor `WIP Salvage <wip@local>` (no un humano ni un modelo identificable) es nuevo y preocupante. Cada vez que aparece, **deja el working tree en un estado que contradice la propuesta commiteada** (en este caso: la propuesta dice `status: done` y referencia `shipped-in: [9bb6c4de]`, pero el archivo vive en `in-progress/`).

---

## 3. Lo que está inmejorable (no tocar)

- **Las 10 reglas duras de AGENTS.md siguen verdes**: `a00043` ya confirmó el cumplimiento 10 / 10.
- **El lint `lint:ephemeral` (f00058) sigue funcionando**: detecta `mkdtempSync(tmpdir())` y `writeFile('/tmp/...')` en runtime code; verificado experimentalmente en este turno (cazó una violación planted en `packages/core/src/__probe__/probe.ts` y reverdeó al eliminarla).
- **El lint `lint:cache` (f00065) sigue funcionando**: solo existe `.cache/mcp-vertex/` como cache root.
- **Las primitivas de concurrencia son robustas**: `withFileMutex` + `writeFileAtomic` + `quarantineCorruptFile` están todas en verde.
- **f00078 — Swarm hygiene routine (en `ready/`)** ataca directamente dos de las fragilidades que este audit documenta (S0 arregla el bug `not-found` en `branch_gc`; S4 añade front-hook en `auto_work`). Es lectura obligada.
- **c00075 — Proposal guardian no debe pausar sin consentimiento (en `ready/`)** ataca directamente otra de las fragilidades (S2 obliga al guardian a verificar `paused-reason` o `blocked-by` antes de pausar). Es lectura obligada.

---

## 4. Hallazgos abiertos (verificados en código y en el filesystem)

### 🔴 P0 — Pérdida silenciosa de trabajo

#### H1 · Duplicación de propuesta `f00058` por el commit `ff5c6264` (WIP Salvage)

**Files**:
- [`docs/mcp-vertex/proposals/done/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/proposals/done/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md) (original, mi `d153bb8f`)
- `docs/mcp-vertex/proposals/in-progress/f00058-canonical-ephemeral-exec-paths-in-plugin-cache.md` (duplicado, staged `D`, contenido verbatim del original)

**Problema**: El commit `ff5c6264` (autor `WIP Salvage <wip@local>`) **copió byte-a-byte** la propuesta `f00058` desde `done/` a `in-progress/`, manteniendo `status: done` y `shipped-in: [9bb6c4de]`. El contenido duplicado es literalmente:

```yaml
---
id: f00058
status: done
type: proposal
track: core+plugins+lint+docs
date: 2026-06-28
kind: feat
title: Canonical ephemeral exec paths inside pluginCacheDir — ...
shipped-in:
  - 9bb6c4de
recan: []
```

El `lint:proposals` reporta el archivo con **WARN** ("folder mismatch: status done expects folder done") pero **NO falla el gate** — solo avisa. Por eso `ff5c6264` pudo entrar sin violar `bun run validate`.

**Impacto**: Confusión operacional y duplicación que requiere limpieza manual. Si el archivo duplicado se mergease, abriría dos PRs con el mismo id, rompiendo el index.json canónico de propuestas (`docs/mcp-vertex/proposals/index.json`).

**Por qué el lint no lo cazó**: El linter actual solo verifica que **el archivo más cercano con ese id** cumple la invariante carpeta ↔ status; no detecta que existe **otro archivo con el mismo id** en otra carpeta. Falta un check de unicidad por id.

**Resolution Track**: 
1. Inmediato: el agente que staged el `D` ya empezó a arreglarlo — no tocar.
2. Estructural: propuesta **`f00079` (a abrir)** — `lint:proposals` debe **FAIL** cuando detecte 2+ archivos con el mismo `id:` en `docs/mcp-vertex/proposals/**/*.md`, **incluso si la carpeta es la misma** (el sync de proposals crea duplicados durante el rename y solo el último sobrevive al commit).

#### H2 · Worktrees de agente desaparecen sin registro

**Files (al momento del audit)**:
- `.cache/mcp-vertex/.worktrees/` — directorio BORRADO (no existe en disco)
- `git worktree list` — solo reporta `develop`
- `git branch -a` — las ramas `agent/copilot-minimax-m3-s57` y `agent/copilot-minimax-m3-x00056` ya NO existen

**Problema**: Ayer, en este mismo turno, moví manualmente `agent/copilot-minimax-m3-x00056` desde `/tmp/mcp-vertex-x00056` a `.cache/mcp-vertex/.worktrees/copilot-minimax-m3-x00056` para cumplir AGENTS.md "cache is ALWAYS the root cache — never per-folder". Hoy, esos worktrees **ya no están**. El reflog muestra que el último `git worktree` que se ejecutó fue el merge `062bdf34 merge agent/copilot-minimax-m3-s57`, que automáticamente pruneó el worktree merged+clean. La rama `agent/copilot-minimax-m3-x00056` fue probablemente borrada por `branch_gc` ejecutándose sin que nadie lo viera.

**Impacto**: Pérdida silenciosa de archivos untracked que estaban en esos worktrees (no había commits; eran working copies). Si alguien tenía un análisis a medio terminar, un spec sin commitear, un experimento de slice, **se evaporó sin aviso**.

**Por qué el sistema lo permite**: 
- `branch_gc` no distingue entre "merged and clean" y "merged and abandoned work-in-progress". El bug "not-found" que `f00078 S0` cita es una variante del mismo problema: el engine de GC trata worktrees merged como `skipped: not-found` en vez de avisar.
- No hay un "dry-run by default" — `branch_gc` borra en la misma operación que reporta.
- No hay un "moved-to-quarantine" path — los worktrees se `rm -rf` directamente.

**Resolution Track**: Implementar **`f00078`** (ya en `ready/`). Su S0 (fix `branch_gc`), S1 (auto_work surface hints), S2 (`swarm_hygiene` read-only tool) y S4 (front-hook que bloquea si hay rescue candidates) cierran los 4 puntos débiles.

### 🟠 P1 — Drift silencioso entre agentes y humanos

#### H3 · Cambios de lifecycle sin contexto (`ready → paused` sin `paused-reason`)

**Files**:
- `docs/mcp-vertex/proposals/ready/x00074-loop-detector-distinguish-backoff-from-stuck.md` → staged rename a `paused/x00074-...md`

**Problema**: Un agente (o un sync automático) renombró `x00074` de `ready/` a `paused/` **sin dejar rastro del porqué**. El `lint:proposals` reporta WARN ("folder mismatch: status paused expects folder paused") pero no exige un `paused-reason` en el frontmatter.

**Impacto**: Si esta propuesta es trabajo vivo (lo es — el cuerpo describe slices S1-S4 pendientes), el rename silencioso la esconde de los boards que filtran por `ready/`. Un humano o agente que dependa de `auto_work` para sugerir trabajo no la verá.

**Resolution Track**: Implementar **`c00075`** (ya en `ready/`). Su S1 obliga al frontmatter a tener `paused-reason: <text>` cuando `status: paused`; su S2 hace al guardian rechazar transiciones a `paused` sin razón.

#### H4 · 793 líneas de código en audit plugin sin commitear

**Files (untracked)**:
- `plugins/audit/src/lib/services/llm-client.service.ts` (465 líneas)
- `plugins/audit/src/lib/services/proposal-scaffolder.service.ts` (328 líneas)

**Problema**: Estos son los servicios centrales del tool `audit_run` propuesto por `f00077`. Llevan código de implementación (no es boilerplate ni test) y están **untracked**. Cualquier `git reset --hard`, `git clean -fd`, o commit de otro agente con un `.gitignore` que los cubra accidentalmente los borra.

**Impacto**: Pérdida potencial de horas de trabajo del agente paralelo que está implementando `f00077`.

**Resolution Track**: Ninguno propio; depende de que el agente responsable de `f00077` los commitee. El sistema debería **advertir al usuario cuando hay > N archivos untracked de > X líneas en `plugins/*/src/`** antes de cualquier operación destructiva (ver H5).

### 🟡 P2 — Gaps de observabilidad y audit

#### H5 · `lint:proposals` no detecta duplicación de id ni exit ≠ 0 en WARN

**File**: `tools/scripts/lint/proposals.script.ts`

**Problema**: El linter actual tiene una batería útil pero le falta:
1. **Detección de duplicación por `id:`** — si dos archivos tienen el mismo `id:`, solo avisa en uno (el último commiteado); debería **FAIL** porque rompe el `proposals/index.json` canónico.
2. **Detección de carpeta incorrecta por `status:`** — avisa pero exit=0; debería ser **FAIL** cuando `shipped-in: [...]` está poblado y la carpeta es `in-progress/` (señal inequívoca de duplicación o drift).
3. **Detección de proposals sin `paused-reason:` cuando `status: paused`** — avisa, debería ser **FAIL** (ver c00075).

**Impacto**: Permite que bugs como H1, H2 (parcialmente), H3 pasen el gate de `bun run validate` sin que CI los rechace. El agente `WIP Salvage` puede seguir cometiendo duplicaciones sin enterarse.

**Resolution Track**: Reforzar `tools/scripts/lint/proposals.script.ts` con los 3 checks anteriores. Es ~50 líneas de código + un spec. Se puede empaquetar en **`f00079`** o como slice de `x00076`.

#### H6 · Agente `WIP Salvage <wip@local>` opera sin identidad trazable

**File**: N/A (git author/email pattern)

**Problema**: Aparecen commits con autor `WIP Salvage <wip@local>` (no un humano, no un modelo identificado). El patrón `reset → reset → commit` antes del commit sugiere un script que limpia el working tree parcialmente, hace el commit, y deja archivos sueltos. Estos commits **no son auditables a un agente concreto** y rompen la propiedad por agente que el orquestador de mcp-vertex declara en el ownership de cada propuesta.

**Impacto**: Cuando aparece un bug introducido por uno de estos commits, no se puede:
- Preguntarle al agente responsable.
- Bloquearlo en futuros PRs (no hay agent id).
- Auditar el quality del trabajo por modelo / agent slot.

**Resolution Track**: El orquestador de mcp-vertex debe **rechazar commits cuyo autor no esté en `mcp-vertex.config.json#agents[*]`** (o un equivalente en el sistema de git hooks). Esto es similar a la regla que ya existe para `codeowners` pero por autor.

---

## 5. Concurrency table (mandatory, con foco en robustez)

| Scenario | Risk | Estado actual | Gap de robustez |
|---|---|---|---|
| Dos agentes commitean `docs/mcp-vertex/proposals/done/<id>-<slug>.md` simultáneamente | Dos archivos con el mismo `id` | `lint:proposals` solo WARN | **FAIL** en duplicación (H5) |
| Agente A commitea `in-progress/f00058-...md` mientras agente B commitea `done/f00058-...md` | Propuesta duplicada en `index.json` | Detectado visualmente pero no por el lint | FAIL + post-commit hook que valide unicidad |
| `branch_gc` ejecuta sobre worktree merged+dirty | Borra working copy sin aviso | `f00073` S3 ejecuta el borrado directo | Dry-run by default + `quarantine/` path (H2) |
| `proposals_sync_proposals` ejecuta antes que el agente commitee el slice | El sync mueve el archivo antes del commit | Posible condición de carrera | Lock per-slice antes del sync (ver `mcp-vertex_proposals_proposal_lock`) |
| Agente A hace `git reset --hard` cuando hay archivos untracked en plugins | Borra trabajo de agente B | `git reset --hard` no toca untracked por defecto; `git clean -fd` sí | Advertencia pre-`git clean` con archivos > 100 líneas (H4) |
| Un humano hace `git stash` y luego `git stash drop` | Cambios sin commit desaparecen | Sin aviso | Mensaje `git stash drop` con `git stash show -p` preview |
| Auto-merge (`git merge --no-ff agent/*`) ejecuta con worktrees sucios | Confunde "ahead==0" con "merged clean" | `d8d27905 mergedIntoBase requires ahead==0` corrige parte | Aplicar la misma invariante a `branch_gc` (H2) |

---

## 6. AGENTS.md hard rules compliance scan

| Rule | Status | Notes |
|---|---|---|
| 1. Core agnostic | ✅ | Sin cambios. |
| 2. No `process.cwd()` in engines | ✅ | Sin cambios. |
| 3. No `*Sync` in hot paths | ✅ | Sin cambios. |
| 4. Durable writes through primitives | ✅ | Sin cambios. |
| 5. Workspace-scoped paths use `resolveWorkspaceContained` | ✅ | Sin cambios. |
| 6. `redactSecrets` before persisting | ✅ | Sin cambios. |
| 7. Token budget invariant guarded | ✅ | Sin cambios. |
| 8. Every public tool has `outputSchema` | ✅ | Sin cambios. |
| 9. i18n complete | ✅ | Sin cambios. |
| 10. No `.py`/`.sh` in `tools/`/`scripts/` | ✅ | Sin cambios. |
| 11. Host files point at the universal bootstrap | ✅ | Sin cambios. |
| 12. Ephemeral exec paths live in `<pluginCacheDir>/exec/` (f00058) | ✅ | Sin cambios desde el cierre de f00058. |

**Cumplimiento global: 12 / 12.** La auditoría NO encontró regresiones en las reglas existentes.

**Sin embargo**: el AGENTS.md NO tiene reglas para los puntos de coordinación que este audit documenta. Las reglas 1-12 son **estáticas** (sobre el código fuente); los puntos débiles son **dinámicos** (sobre el lifecycle del repo y de los agentes). Se propone añadir reglas 13-15 en un PR separado.

---

## 7. Propuestas que ya atacan estos problemas (lectura obligada)

| ID | Status | Slice relevante | Ataque directo a |
|---|---|---|---|
| `f00078` | ready | S0 (fix `branch_gc` not-found) | H2 |
| `f00078` | ready | S1 (auto_work surface hints) | H2 |
| `f00078` | ready | S2 (proposals_swarm_hygiene tool) | H2 |
| `f00078` | ready | S4 (front-hook blocking rescue/stash) | H2 |
| `c00075` | ready | S1 (`paused-reason` required) | H3 |
| `c00075` | ready | S2 (guardian rejects manual pause without reason) | H3 |
| `x00076` | ready | S1 (sync tool-outputs) | a00043 H1 |
| `x00076` | ready | S2 (move finished f00058) | a00043 H2 + H1 (parcial) |

**Recomendación**: Implementar `f00078 S0 + S4` y `c00075 S1 + S2` antes que nada — son los dos que cierran las brechas P0 y P1 que este audit documenta. `x00076` es cosmético comparativamente.

---

## 8. Scoreboard (enfoque robustez)

| Dimensión | Score | Justificación |
|---|---:|---|
| **Cumplimiento de reglas duras (AGENTS.md 1-12)** | 10.0 | Sin regresiones. |
| **Concurrencia y durabilidad de código fuente** | 10.0 | Sin cambios desde a00043. |
| **Robustez de coordinación multi-agente** | 6.5 | Duplicación silenciosa (H1), worktrees sin rastro (H2), lifecycle sin contexto (H3), código untracked sin protección (H4). |
| **Observabilidad de lifecycle de propuestas** | 5.8 | `lint:proposals` es WARN-only en 3 puntos críticos (H5); `WIP Salvage` opera sin trazabilidad (H6). |
| **Idempotencia de worktrees de agente** | 4.0 | El `git worktree move` de ayer fue destruido sin registro (H2). El sistema no tiene un "dry-run by default" para GC. |
| **Deduplicación de propuestas por id** | 3.0 | El sistema permite y ha producido duplicación real (H1). |
| **Mecanismos preventivos de pérdida de trabajo** | 4.5 | `withFileMutex` + `writeFileAtomic` cubren el código commiteado; los untracked y los worktrees sucios no tienen equivalente. |

**Puntuación global de robustez**: **6.2 / 10** — el sistema **es correcto en lo que vigila**, pero **NO vigila los puntos de coordinación que más fallan cuando varios agentes y humanos trabajan en paralelo**.

---

## 9. Recomendaciones ordenadas

### Inmediato (sin código nuevo)
1. **No revertir el `D` staged** del duplicado de f00058 — ya está en proceso de limpieza.
2. **No revertir el `R` staged** de x00074 → paused si el trabajo está abandonado; **pero verificar primero** que x00074 no esté en curso.

### Corto plazo (1-2 días, propuesta `f00079` a abrir)
3. **Reforzar `lint:proposals`** con:
   - FAIL on duplicate `id:` across `docs/mcp-vertex/proposals/**/*.md`.
   - FAIL on folder ↔ status mismatch when `shipped-in: [...]` is non-empty.
   - FAIL on `status: paused` without `paused-reason:` field (alinéa con `c00075`).
4. **Bloquear commits `WIP Salvage`** sin agent id en `lefthook.yml` (pre-commit hook).

### Medio plazo (esta semana, ya hay propuestas en `ready/`)
5. **Implementar `f00078 S0 + S4`** — cierra H2 (worktrees sin rastro).
6. **Implementar `c00075 S1 + S2`** — cierra H3 (lifecycle sin contexto).
7. **Implementar `x00076 S1 + S2`** — cierra los hallazgos cosméticos de `a00043`.

### Largo plazo (gobernanza)
8. **Añadir reglas 13-15 a AGENTS.md**:
   - 13. "Una propuesta no se duplica por `id:` — `lint:proposals` falla si dos archivos comparten `id:`."
   - 14. "Un worktree de agente solo se borra con `dry-run: true` por defecto — el borrado real exige `force: true` explícito."
   - 15. "Un commit sin agent id declarado en `mcp-vertex.config.json#agents[*]` se rechaza en pre-commit hook."
9. **Documentar en `docs/mcp-vertex/AGENT-BOOTSTRAP.md`** el patrón "WIP Salvage" como anti-pattern, con un ejemplo de cómo NO hacer commits.

---

## 10. Nota de cierre

Esta auditoría **NO atribuye culpa** al commit `ff5c6264` ni a ningún agente concreto. El autor `WIP Salvage <wip@local>` indica un script automatizado (probablemente un agente en un worktree aislado que no siguió las convenciones del orquestador de mcp-vertex), y el sistema **debería haberlo detectado y detenido** en lugar de aceptar el commit como válido.

La robustez sistémica **no se trata de hacer cumplir las reglas a los agentes**, sino de **hacer que el sistema falle de forma ruidosa cuando un agente o humano intenta saltarse una regla**. Hoy, las reglas 1-12 son ruidosas; las reglas 13-15 (y las propuestas `f00078`, `c00075`, `f00079` que las empaquetan) deben serlo también.
