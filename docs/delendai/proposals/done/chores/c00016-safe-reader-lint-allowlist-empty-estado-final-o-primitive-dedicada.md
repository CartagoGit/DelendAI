---
id: c00016
title: "\"safe-reader-lint-allowlist-empty-estado-final-o-primitive-dedicada\""
kind: chore
status: done
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# c00016 — el lint de safe-reader queda sin allowlist

## Goal

Llevar `architecture-readfile-via-safe-reader` al estado final sin allowlist, de forma que cualquier reintroducción de `readFile` directo en plugins con `filesystem-read` falle en CI sin excepciones manuales.

## why

Una allowlist larga convierte el lint en deuda crónica y debilita la invariante. Tras migrar `search`, `project-health` y `quality-policy`, ya no quedaba una justificación técnica para seguir tolerando excepciones permanentes.

## non-goals

- No añade una primitive nueva de cache porque las rutas necesarias pudieron resolverse con readers seguros existentes.
- No toca plugins que ya estaban conformes con el lint.

## Slices

- global_gate: none

### S1 — Vaciar la allowlist y migrar los últimos remanentes
- **Status**: done
- **Files**: `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts`, `plugins/search/src/lib/tools/search-semantic.tool.ts`, `plugins/search/src/lib/embed/embed-pipeline.ts`, `plugins/search/src/lib/embed/index-store.ts`, `plugins/project-health/src/lib/services/project-health-signals.service.ts`, `plugins/quality-policy/src/lib/services/quality-policy.service.ts`, `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts`
- **Gate**: none

## acceptance

- `const ALLOWLIST` del lint queda vacío.
- `bun run lint:architecture-readfile-via-safe-reader` devuelve `0 violations`.
- Los plugins antes exceptuados siguen pasando sus validaciones focalizadas tras migrar a readers seguros.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=c00016` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
