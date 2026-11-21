---
id: x00220
title: "procesos: maxOutputBytes real (buffers UTF-8), recorte de chunks y política stdout+stderr"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-08-24
---

# x00220 — procesos: maxOutputBytes real (buffers UTF-8), recorte de chunks y política stdout+stderr

## Goal

Hacer que `maxOutputBytes` sea un límite real en bytes UTF-8, con recorte de chunks al byte exacto restante y una política explícita stdout+stderr.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §6 PR-001 — `maxOutputBytes` debe ser realmente bytes (`Buffer.byteLength`)
- §6 PR-002 — no añadir chunks enteros si superan el restante
- §6 PR-003 — límite combinado stdout+stderr (decidir semántica)

Hoy se usa `output.length` (UTF-16) y `if (output.length < max) output += chunk` añade el chunk entero. En `runArgv` stdout y stderr se limitan por separado (total potencial ≈ 2×max). Decisión de semántica: `maxOutputBytes = total combinado`, con sub-límites opcionales `maxStdoutBytes`/`maxStderrBytes`.

## why

`maxOutputBytes` no es hoy un máximo real: mide unidades UTF-16 y añade chunks enteros. Para un sistema que monetiza/optimiza contexto, los límites de salida deben ser honestos y reproducibles.

## non-goals

- No cambiar el runner shell (argv-first se mantiene; PR-005 es principio, no cambio de código aquí).
- No introducir streaming de salida (se sigue acumulando con límite).
- No alterar la API pública de runCommand/runArgv salvo la semántica del límite.

## Slices

- global_gate: type

### S1 — Acumulación por Buffers y recorte de chunks
- **Status**: done
- **Files**: `packages/core/src/lib/shared/run-command.ts`
- **Gate**: type
- acceptance:
  - "Usa Buffer.byteLength (UTF-8) para medir."
  - "remaining = max - collected; push(chunk.subarray(0, remaining))."
  - "El límite nunca se excede."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Política combinada stdout+stderr
- **Status**: done
- **Files**: `packages/core/src/lib/external-tool/run-external-tool.ts`
- **Gate**: type
- acceptance:
  - "maxOutputBytes es el total combinado."
  - "Opcionalmente maxStdoutBytes/maxStderrBytes con nombres inequívocos."
  - "Documentado en el contrato de run-command."

### S3 — Tests de límites reales
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/run-command-bytes.spec.ts`
- **Gate**: type
- acceptance:
  - "Salida con caracteres multibyte (emoji/acentos) respeta el límite en bytes."
  - "Un chunk que supera el restante se recorta al byte exacto."

## acceptance

- Usa Buffer.byteLength (UTF-8) para medir.
- remaining = max - collected; push(chunk.subarray(0, remaining)).
- El límite nunca se excede.
- maxOutputBytes es el total combinado.
- Opcionalmente maxStdoutBytes/maxStderrBytes con nombres inequívocos.
- Documentado en el contrato de run-command.
- Salida con caracteres multibyte (emoji/acentos) respeta el límite en bytes.
- Un chunk que supera el restante se recorta al byte exacto.
