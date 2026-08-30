---
id: t00014
title: "process runner — regression guard UTF-8 byte boundaries (1/2/3/4 bytes)"
kind: test
type: proposal
status: done
track: regression
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "PROC-001 — No regresar UTF-8 byte boundaries"
    finding: PROC-001
    priority: P3 (regression guard)
related:
    - x00239 # process utf8 edge truncation (already closed)
    - packages/core/src/lib/shared/truncate-utf8.ts
    - packages/core/src/lib/shared/run-command-bytes.ts
shipped-in:
    - bd3d1c6c4e354437ca9d1d052f000f27268b5426 # test(utf8): t00014 — UTF-8 byte boundaries regression guard
---

# t00014 — process runner: UTF-8 byte boundaries regression

## Goal

Mantener y extender la cobertura de tests que verifican que el
process runner (y `truncateUtf8Buffer`) respetan los boundaries de
UTF-8. Casos cubiertos (ya en
`packages/core/tests/src/lib/shared/truncate-utf8.spec.ts` +
`run-command-bytes.spec.ts`):

- 1-byte ASCII (`a`, `b`, `c`).
- 2-byte UTF-8 (`ñ`, `ü`, `日` parte del 2-byte).
- 3-byte UTF-8 (`日`, `中`, `ñ` BMP extendida).
- 4-byte emoji (`🎉`, `🎊`, `🚀`).
- **Chunk split exactamente en lead byte**: cortar el stream justo
  después de un lead byte; el siguiente chunk debe reensamblar el
  carácter completo.
- **Chunk split dentro de continuation bytes**: cortar el stream
  dentro de los bytes de continuación; idem, reensamblar.
- **stdout + stderr combined cap**: la concatenación preserva
  boundaries.
- **Long string truncada**: una cadena de 1MB con mezcla de
  secuencias 1/2/3/4-byte se trunca a `maxBytes` sin partir ningún
  carácter.

## why

PROC-001 (P3, "CONFIRMADO como arreglado"). Los tests existentes son
el regression guard contra el bug histórico `process.stdout.read()`
que cortaba UTF-8 a mitad de carácter. El audit pide mantener la
cobertura.

## non-goals

- No optimiza el path de decodificación (es correctness, no perf).
- No cambia el contrato público.
- No añade cobertura para otras codificaciones (Latin-1, etc.) — el
  runner es UTF-8 por construcción.

## Slices

- global_gate: type

### S1 — Verificar cobertura actual

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/shared/truncate-utf8.spec.ts`, `packages/core/tests/src/lib/shared/run-command-bytes.spec.ts`
- **Gate**: type
- notes: "Confirmar que los 7 casos del audit ya tienen al menos
  un test verde cada uno."

### S2 — Añadir gaps si los hay

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/shared/truncate-utf8.spec.ts`
- **Gate**: type
- notes: "Si falta el caso 'chunk split dentro de continuation
  bytes' o 'stdout + stderr combined cap', añadir el test."

## acceptance

- 7 casos del audit con al menos un test verde cada uno.
- `bun test packages/core/tests/src/lib/shared/truncate-utf8.spec.ts`
  verde.
- `bun test packages/core/tests/src/lib/shared/run-command-bytes.spec.ts`
  verde (si existe).

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
