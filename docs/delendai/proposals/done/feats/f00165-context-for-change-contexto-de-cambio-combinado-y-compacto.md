---
id: f00165
title: "context_for_change: contexto de cambio combinado y compacto"
kind: feat
status: done
type: proposal
track: product
date: 2026-08-24
shipped-in:
  - ecdf9778 # chore(proposals): f00165 → review
  - 1a17dbb5 # feat(f00165): plugin context-for-change — contexto de cambio combinado y compacto
---

# f00165 — context_for_change: contexto de cambio combinado y compacto

## Goal

Crear `context_for_change`: una tool que combina diff + símbolos + referencias + tests relacionados + docs + conventions + memoria reciente y devuelve únicamente el contexto necesario para una tarea, en lugar de que el LLM lo descubra con 10 llamadas.

Parte del plan `q00003`. Referencia legada: §23 IDEA-001 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Firma: `context_for_change({ files?, gitDiff?, symbol?, task? })`. Output compacto y task-oriented. Reutiliza los plugins existentes (git, search, refactor, test-policy, docs, memory, conventions) sin duplicar su lógica.

## why

Hoy un agente gasta 8–10 llamadas y muchos tokens reconstruyendo el contexto de un cambio. Una sola tool que lo orqueste reduce latencia, tokens y errores por contexto incompleto.

## non-goals

- No reimplementar git/search/docs (se orquesta, no se duplica).
- No devolver el repo entero (siempre compacto y task-oriented).
- No sustituir el descubrimiento manual en todos los flujos.

## Slices

- global_gate: type

### S1 — Plugin context-for-change con orquestación
- **Status**: done
- **Files**: `plugins/context-for-change/src/lib/tools/context-for-change.tool.ts`
- **Gate**: type
- acceptance:
  - "Combina diff/símbolos/referencias/tests/docs/conventions/memory en un output compacto."
  - "dependsOn declara los plugins que orquesta (git, search, memory, docs)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Wiring y tests del plugin
- **Status**: done
- **Files**: `plugins/context-for-change/src/index.ts`
- **Gate**: type
- acceptance:
  - "Plugin registrado con preset hint y manifest."
  - "Tests cubren la combinación de fuentes y el tamaño del output."

## acceptance

- Combina diff/símbolos/referencias/tests/docs/conventions/memory en un output compacto.
- dependsOn declara los plugins que orquesta (git, search, memory, docs).
- Plugin registrado con preset hint y manifest.
- Tests cubren la combinación de fuentes y el tamaño del output.
