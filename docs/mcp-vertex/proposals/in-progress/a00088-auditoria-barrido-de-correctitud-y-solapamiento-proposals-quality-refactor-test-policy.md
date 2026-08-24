---
id: a00088
title: "auditoría: barrido de correctitud y solapamiento (proposals, quality, refactor, test-policy, ...)"
kind: audit
status: in-progress
type: proposal
track: plugin-hardening
date: 2026-08-24
---

# a00088 — auditoría: barrido de correctitud y solapamiento (proposals, quality, refactor, test-policy, ...)

## Goal

Auditar los plugins restantes por ejes de correctitud y solapamiento, cerrando el checklist §24 de la auditoría legada.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Ejes por grupo:

- **perf, prompt-eval, usage-tracking**: benchmark noise, reproducibilidad, estimated vs actual tokens, cardinality, persistence.
- **proposals, quality, rules**: state transitions, multi-agent concurrency, stale state, timeouts, shell, dogmas, false positives.
- **refactor, search, skills-pack, status-marker**: rename safety, references, atomicity, hybrid weighting, lifecycle, race conditions.
- **conventions, tech-debt, test-convention, test-policy**: false positives, TODO semantics, path conventions, overlap con quality.

Nota: `error-reporting` queda cubierto por el track privacy dedicado (6 propuestas). Cada hallazgo se clasifica y se deriva a fix solo con evidencia.

## why

Cierra el checklist de los 43 plugins con los ejes de correctitud y solapamiento, asegurando que ninguna observación razonable del §24 quede sin verificar.

## non-goals

- No cubrir error-reporting (track privacy).
- No 'arreglar' observaciones no reproducibles.
- No tocar código aquí (solo hallazgos).

## Slices

- global_gate: none

### S1 — Auditar perf/prompt-eval/usage-tracking
- **Status**: pending
- **Files**: `plugins/perf/**`, `plugins/prompt-eval/**`, `plugins/usage-tracking/**`
- **Gate**: none
- acceptance:
  - "Ruido de benchmark, estimated vs actual y cardinality revisados."

### S2 — Auditar proposals/quality/rules
- **Status**: pending
- **Files**: `plugins/proposals/**`, `plugins/quality/**`, `plugins/rules/**`
- **Gate**: none
- acceptance:
  - "State transitions, concurrency, timeouts y dogmas revisados."

### S3 — Auditar refactor/search/skills-pack/status-marker
- **Status**: pending
- **Files**: `plugins/refactor/**`, `plugins/search/**`, `plugins/skills-pack/**`, `plugins/status-marker/**`
- **Gate**: none
- acceptance:
  - "Rename safety, hybrid weighting y race conditions revisados."

### S4 — Auditar conventions/tech-debt/test-convention/test-policy
- **Status**: pending
- **Files**: `plugins/conventions/**`, `plugins/tech-debt/**`, `plugins/test-convention/**`, `plugins/test-policy/**`
- **Gate**: none
- acceptance:
  - "False positives y solapamiento con quality revisados."

## acceptance

- Ruido de benchmark, estimated vs actual y cardinality revisados.
- State transitions, concurrency, timeouts y dogmas revisados.
- Rename safety, hybrid weighting y race conditions revisados.
- False positives y solapamiento con quality revisados.

## verified state

Pendiente: los hallazgos de esta auditoría se verifican contra el código antes de su cierre.

## findings

Pendiente: sin hallazgos clasificados aún.

## scoreboard

| Severidad | Conteo |
|---|---|
| alta | 0 |
| media | 0 |
| baja | 0 |
