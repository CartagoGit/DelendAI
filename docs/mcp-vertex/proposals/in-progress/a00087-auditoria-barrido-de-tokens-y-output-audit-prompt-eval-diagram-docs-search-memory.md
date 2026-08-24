---
id: a00087
title: "auditoría: barrido de tokens y output (audit, prompt-eval, diagram, docs, search, memory, ...)"
kind: audit
status: in-progress
type: proposal
track: plugin-hardening
date: 2026-08-24
---

# a00087 — auditoría: barrido de tokens y output (audit, prompt-eval, diagram, docs, search, memory, ...)

## Goal

Auditar los plugins por ejes de tokens/output/coste, siguiendo el checklist §24 de la auditoría legada.

Parte del plan `q00003`. Referencia legada: §24 de `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`.

Ejes por grupo:

- **audit, prompt-eval, prompts-pack, skills-pack**: coste en tokens, fan-out multi-model, token tax del contenido estático, loading strategy.
- **diagram, docs, search, changelog**: grafos enormes, paginación, output size, truncación, symlink safety, historias gigantes.
- **auto-agent-selector, auto-plugin-selector, memory, notification**: scoring, fallback, polling vs event-driven, refresh global, dedupe.
- **cache, conventions, deps, i18n, issues, issues-triage**: namespaces, false positives, lockfile handling, locale drift, auto-comment safety, bot disclosure.

Cada hallazgo se clasifica y se deriva a fix solo con evidencia.

## why

Los plugins con output grande o catálogo estático son los que más token tax pagan. Revisarlos por ejes de output/paginación/coste permite priorizar las optimizaciones de tokens con evidencia, no con intuición.

## non-goals

- No cubrir memory en profundidad (hay propuesta dedicada de freshness).
- No 'arreglar' observaciones no reproducibles.
- No tocar código aquí (solo hallazgos).

## Slices

- global_gate: none

### S1 — Auditar audit/prompt-eval/prompts-pack/skills-pack
- **Status**: pending
- **Files**: `plugins/audit/**`, `plugins/prompt-eval/**`, `plugins/prompts-pack/**`, `plugins/skills-pack/**`
- **Gate**: none
- acceptance:
  - "Coste en tokens, fan-out y token tax estático revisados; hallazgos clasificados."

### S2 — Auditar diagram/docs/search/changelog
- **Status**: pending
- **Files**: `plugins/diagram/**`, `plugins/docs/**`, `plugins/search/**`, `plugins/changelog/**`
- **Gate**: none
- acceptance:
  - "Output size, paginación, symlink y historias gigantes revisados."

### S3 — Auditar auto-agent/auto-plugin-selector/memory/notification
- **Status**: pending
- **Files**: `plugins/auto-agent-selector/**`, `plugins/auto-plugin-selector/**`, `plugins/memory/**`, `plugins/notification/**`
- **Gate**: none
- acceptance:
  - "Scoring, fallback, polling y refresh global revisados."

### S4 — Auditar cache/conventions/deps/i18n/issues/issues-triage
- **Status**: pending
- **Files**: `plugins/cache/**`, `plugins/conventions/**`, `plugins/deps/**`, `plugins/i18n/**`, `plugins/issues/**`, `plugins/issues-triage/**`
- **Gate**: none
- acceptance:
  - "Namespaces, false positives, lockfile, locale drift y bot disclosure revisados."

## acceptance

- Coste en tokens, fan-out y token tax estático revisados; hallazgos clasificados.
- Output size, paginación, symlink y historias gigantes revisados.
- Scoring, fallback, polling y refresh global revisados.
- Namespaces, false positives, lockfile, locale drift y bot disclosure revisados.

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
