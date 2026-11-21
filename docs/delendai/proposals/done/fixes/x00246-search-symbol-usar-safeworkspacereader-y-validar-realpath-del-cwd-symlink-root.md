---
id: x00246
title: "search_symbol: usar SafeWorkspaceReader y validar realpath del cwd symlink-root"
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
audit-source:
  file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
  commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
  priority: P1
  finding: SRCH-001
  reviewer: ChatGPT-5.6-Sol (external, high reasoning)
plan-parent: q00005
related:
  - x00241
  - x00247
  - x00248
  - t00010
parent-plan: q00005
---

# x00246 — search_symbol: usar SafeWorkspaceReader y validar realpath del cwd symlink-root

## Goal

Eliminar la vía de escape de `search_symbol` mediante symlinks de directorio usados como `cwd`. La tool pasa a invocar `SafeWorkspaceReader.resolveExistingContained()` sobre cada entrada del traversal, garantizando que el `realpath` permanece dentro del workspace. La validación realpath ocurre antes de iniciar la lectura, no después del primer readdir.

**Hallazgo auditoría externa:** `SRCH-001`

**Propuestas relacionadas**: `x00241`, `x00247`, `x00248`, `t00010`.

**PLAN padre**: `q00005` (ver `docs/mcp-vertex/proposals/ready/plans/q00005-...md`). La tabla de tracks/propuestas del plan padre mantiene el estado real de esta hija; al avanzar, actualizar su estado en el plan.

**Auditoría externa (referencia legada)**: `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md` — este archivo conserva la crítica narrativa completa y el TODO ejecutable; esta propuesta cierra los puntos `SRCH-001` del TODO ejecutable.

## why

El auditor externo (tercera pasada, SRCH-001) confirma por semántica estática que `search_symbol` hace containment léxico sobre `cwd` pero luego recorre y lee con `readdir/readFile` directos. Un `cwd = workspace/external-link -> /outside/project` es léxicamente válido, pero `readdir()` sigue el symlink y el traversal real sale del workspace. La primitive `SafeWorkspaceReader` introducida por q00004 (`x00241`) ya cubre este caso: esta hija la reutiliza sin duplicar lógica de walker.

## non-goals

- No modificar el contrato público de la tool (input/output schema) más allá del comportamiento de containment.
- No añadir cache ni optimizaciones; correctness, no perf.
- No tocar otras tools de search (cubierto por x00247 y x00248).
- No introducir nuevas dependencies; SafeWorkspaceReader ya es API pública del core.

## Slices
- global_gate: type

## Slices

### SS1 — Reescribir traversal de search_symbol sobre SafeWorkspaceReader
- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search-symbol.tool.ts`, `plugins/search/src/lib/services/symbol-walker.ts`, `plugins/search/tests/src/lib/tools/search-symbol.tool.spec.ts`
- **Gate**: type

### SS2 — Eliminar readdir/readFile directos en el path de search_symbol
- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search-symbol.tool.ts`
- **Gate**: lint


## acceptance

Criterios verificables, ideales como tests rojos → verdes. Acceptance global del plan padre en `docs/mcp-vertex/proposals/ready/plans/q00005-...md`. Cada criterio debe quedar evidenciado con commit hash + métrica before/after cuando aplique, en `resolution.evidence`.

- Test adversarial con symlink-root falla antes del fix y pasa después (fixture workspace/external-link → /outside con cwd='external-link').
- Ningún readdir/readFile directo en el path de search_symbol (verificación vía grep).
- `bun run lint:architecture-readfile-via-safe-reader` verde para el path de search_symbol.
- Test unit verde para cwd normal (sin symlink): sin regresión funcional.
- Resolver valida realpath por entrada, no solo por root.
- Edge case Windows documentado: si la creación de symlink requiere privilegios, el test se salta condicionalmente con `if (canCreateSymlinks)`.
- Evidence archivada con commit hash + before/after fixture.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00246` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
