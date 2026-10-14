---
id: f00173
title: "error-reporting: observar todas las superficies de error (tools, lifecycle, LLM/providers, procesos) con análisis de origen"
kind: feat
status: done
type: proposal
track: privacy
date: 2026-08-24
---

# f00173 — error-reporting: observar todas las superficies de error (tools, lifecycle, LLM/providers, procesos) con análisis de origen

## Goal

Ampliar `@mcp-vertex/error-reporting` para que observe **todas las superficies de error que mcp-vertex toca**, no solo los fallos de tool. Cada error detectado se registra en un log local seguro y, si procede, genera la issue correspondiente.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`): §24 `error-reporting` + §30 (clases de datos) + §35 (logging seguro). Complementa `x00214` (pipeline DTO) y `x00215` (clasificación interna).

Superficies a observar (análisis exhaustivo de origen):

1. **Tool calls** — ya cubierto por `onToolCall`.
2. **Lifecycle de plugins** — fallos de `register()`, excepciones de hooks (`onToolCall`/`onToolStart`/`onToolCancel` que lanzan), fallos de dependencias. Hoy son invisibles.
3. **Interacciones con LLM/providers** — errores de `orchestrator-runner invoke` y `auto-agent-selector auto_run`. **Caso clave: "error de formato al enviar a un LLM"** (el provider rechaza un payload malformado). Ese error SÍ es reportable si el payload lo generó mcp-vertex, y se clasifica con origen propio (`LLM_FORMAT`) — no es un error del proyecto.
4. **Ejecución de procesos** — fallos de `runArgv`/`runCommand` (timeout, exit no cero) que hoy solo se ven como texto del tool.

Regla de origen (fail-closed): si no se puede demostrar que el origen es mcp-vertex (bug interno o payload generado por mcp-vertex), NO se envía. El error del proyecto o del proveedor externo ajeno a mcp-vertex nunca se reporta.

## why

Hoy solo se observan los fallos de tool (`onToolCall`). Los fallos de `register`, las excepciones de hooks, los errores de formato al enviar a un LLM y los fallos de proceso son invisibles para el reporting. El usuario detecta los bugs "porque los ve", no porque el sistema los reporte; cubrir todas las superficies es justo lo que cierra ese bucle sin recopilar datos del proyecto.

## non-goals

- No reportar errores del proyecto host ni del proveedor externo ajeno a mcp-vertex.
- No cambiar el pipeline DTO (x00214) ni la clasificación interna (x00215): se construye encima.
- No adjuntar logs completos ni excerpts arbitrarios (LOG-PRIV-003/004).
- No introducir telemetría del usuario: solo agregados y códigos internos.

## Slices

- global_gate: type

### S1 — Superficie de observación de errores en core
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/plugins/load-plugins.ts`
- **Gate**: type
- acceptance:
  - "Se añaden hooks de lifecycle de error (onRegisterError / onHookError) al contrato IMcpPluginRegistrations."
  - "El loader emite fallos de register, hooks que lanzan y dependencias fallidas a través de esos hooks."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. Fase 1 review 2026-08-25: validate verde.
### S2 — error-reporting suscribe todas las superficies + análisis de origen
- **Status**: done
- **Files**: `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/src/lib/origin-analyzer.helper.ts`
- **Gate**: type
- acceptance:
  - "El plugin observa tool calls, lifecycle de plugins, invocaciones a LLM/providers y procesos."
  - "El origin-analyzer distingue internal / project / llm-format / provider / environment."
  - "Solo internal y llm-format (payload generado por mcp-vertex) son reportables; el resto es local-only."

### S3 — Análisis exhaustivo del origen LLM/format y tests
- **Status**: done
- **Files**: `plugins/error-reporting/tests/origin-analyzer.spec.ts`
- **Gate**: type
- acceptance:
  - "Un error de formato al enviar a un LLM con payload generado por mcp-vertex se clasifica llm-format y se reporta."
  - "Un error del proveedor ajeno a mcp-vertex NO se reporta."
  - "Un fallo de register/hook se observa y clasifica internal sin filtrar datos del proyecto."

## acceptance

- Se añaden hooks de lifecycle de error (onRegisterError / onHookError) al contrato IMcpPluginRegistrations.
- El loader emite fallos de register, hooks que lanzan y dependencias fallidas a través de esos hooks.
- El plugin observa tool calls, lifecycle de plugins, invocaciones a LLM/providers y procesos.
- El origin-analyzer distingue internal / project / llm-format / provider / environment.
- Solo internal y llm-format (payload generado por mcp-vertex) son reportables; el resto es local-only.
- Un error de formato al enviar a un LLM con payload generado por mcp-vertex se clasifica llm-format y se reporta.
- Un error del proveedor ajeno a mcp-vertex NO se reporta.
- Un fallo de register/hook se observa y clasifica internal sin filtrar datos del proyecto.
