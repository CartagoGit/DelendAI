---
id: f00157
title: "Tool única de adopción end-to-end (adopt_project)"
kind: feat
status: done
type: proposal
track: adoption
date: 2026-08-23
shipped-in: ["285a9b8d"]
---

# f00157 — Tool única de adopción end-to-end (adopt_project)

## Goal

Una sola llamada (`adopt_project`) que orqueste la adopción completa de un proyecto existente — config base (init_config), estructura de propuestas (proposal_adopt apply), bloque de host coherente con la estrategia del CLI y setup de issues — y devuelva un checklist verificado (qué se escribió, qué queda manual, cómo relanzar el host). El objetivo es que un LLM haga UNA llamada y obtenga un estado "adoptado y verificado", sin encadenar 5-7 acciones.

## why

Auditoría 2026-08-24 (recomendación top): adoptar un repo exige hoy encadenar init_config → proposal_adopt → quizá migrate → editar preset → setup-github → editar bloque host → relanzar → verificar. Nada lo orquesta y cada paso puede perder al LLM. Compone las piezas ya arregladas (x00208-x00211) en un solo punto de entrada verificable.

## non-goals

- No reimplementar init_config/proposal_adopt: componerlos.
- No tocar el scaffolding de plugin.
- No incluir auto-ejecución de comandos de red (gh/issues) sin consentimiento explícito.

## Slices

- global_gate: type

### S1 — Tool adopt_project (orquestador de adopción)
- **Status**: done
- **Files**: `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`
- **Gate**: type
- acceptance:
  - "La tool registrada orquesta config+propuestas+host+issues con escrituras seguras e idempotentes."
  - "Devuelve un checklist verificado y los pasos manuales residuales mínimos."
  - "Respeta el consentimiento (no escribe fuera de lo declarado, no ejecuta red sin opt-in)."

### S2 — Documentación del camino feliz
- **Status**: done
- **Files**: `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`
- **Gate**: type
- acceptance:
  - "Documentación y knowledge entry describen el camino feliz de una llamada."

### S3 — Tests del orquestador de adopción
- **Status**: done
- **Files**: `packages/core/tests/src/lib/adopt/adopt-project.spec.ts`
- **Gate**: type
- acceptance:
  - "Specs cubren adopción end-to-end sobre un repo de prueba."

## acceptance

- La tool registrada orquesta config+propuestas+host+issues con escrituras seguras e idempotentes.
- Devuelve un checklist verificado y los pasos manuales residuales mínimos.
- Respeta el consentimiento (no escribe fuera de lo declarado, no ejecuta red sin opt-in).
- Documentación y knowledge entry describen el camino feliz de una llamada.
- Specs cubren adopción end-to-end sobre un repo de prueba.
