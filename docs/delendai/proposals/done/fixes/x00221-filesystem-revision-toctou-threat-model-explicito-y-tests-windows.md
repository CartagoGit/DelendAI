---
id: x00221
title: "filesystem: revisión TOCTOU, threat model explícito y tests Windows"
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-08-24
---

# x00221 — filesystem: revisión TOCTOU, threat model explícito y tests Windows

## Goal

Revisar la ventana TOCTOU restante de la contención del filesystem y añadir tests Windows específicos, documentando el threat model.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §4 FS-001 — revisar TOCTOU restante
- §4 FS-002 — tests Windows específicos (drive letters, UNC, junctions, case-insensitive, symlinks, separators)

La estrategia actual (contención léxica + `realpath` + roots autorizados + atomic write + mutex) es una fortaleza y se conserva. Explorar: operaciones fd-relative, `O_NOFOLLOW` donde sea portable, abrir el padre y operar relativo, sandbox del host, y documentar explícitamente el threat model. No convertirlo en requisito de 0.1.x si el coste es alto.

## why

La contención del filesystem es una de las fortalezas del proyecto; documentar su threat model y cubrir Windows evita regresiones de seguridad al portar el runtime.

## non-goals

- No reescribir la capa de contención existente (se refuerza).
- No prometer TOCTOU-proof absoluto si no es portable.
- No tocar fs-write atomic/mutex (ya correctos).

## Slices

- global_gate: type

### S1 — Documentar threat model y mitigaciones
- **Status**: done
- **Files**: `packages/core/src/lib/shared/fs-tools.ts`
- **Gate**: type
- acceptance:
  - "El threat model TOCTOU queda documentado en el propio módulo (qué se cubre, qué no)."
  - "Se evalúan O_NOFOLLOW / fd-relative con decisión registrada."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: fs-tools-windows.spec.ts dedicado confirmado; validate verde.
### S2 — Tests Windows de contención
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/fs-tools-windows.spec.ts`
- **Gate**: type
- acceptance:
  - "Cubren drive letters, UNC, junctions, case-insensitive paths, symlinks y separators."

## acceptance

- El threat model TOCTOU queda documentado en el propio módulo (qué se cubre, qué no).
- Se evalúan O_NOFOLLOW / fd-relative con decisión registrada.
- Cubren drive letters, UNC, junctions, case-insensitive paths, symlinks y separators.
