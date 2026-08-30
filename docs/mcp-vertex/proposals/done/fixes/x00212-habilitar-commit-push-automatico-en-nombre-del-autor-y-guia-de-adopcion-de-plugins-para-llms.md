---
id: x00212
title: "Habilitar commit+push automático en nombre del autor y guía de adopción de plugins para LLMs"
kind: fix
status: done
type: proposal
track: plugins+adoption
date: 2026-08-23
---

# x00212 — Habilitar commit+push automático en nombre del autor y guía de adopción de plugins para LLMs

## Goal

Que este repo (y cualquier proyecto que adopte mcp-vertex) aplique commit+push en el nombre configurado del autor sin que el usuario tenga que recordárselo a cada agente, y que cualquier LLM sepa qué plugins existen y cómo configurarlos según las necesidades del proyecto (incluidos clean code, SOLID, código mantenible, reutilización y arquitectura de carpetas/naming/archivos).

## why

Los agentes no commitean ni pushean al terminar una tarea y el usuario tiene que recordárselo en cada sesión. Causa raíz: (1) las herramientas de escritura del plugin git (_commit/_push) son opt-in detrás de plugins.git.options.allowWrite, y la config de este repo solo fija allowForge:true, así que esas herramientas ni siquiera se registran; (2) no hay commitAuthor explícito en mcp-vertex.config.json (cae al modo git por defecto, que funciona pero queda implícito); (3) ni el bootstrap §5 (Definition of done) ni el knowledge del plugin git dicen "commitea y pushea al terminar"; (4) no existe una guía consolidada que le diga a un LLM, en un proyecto nuevo, qué plugins hay y cómo configurarlos por necesidad (commit/push, clean code/SOLID, convenciones de archivos/naming, calidad).

## non-goals

- No crear un plugin nuevo: se reutilizan git, rules, conventions, quality y test-convention ya existentes.
- No tocar la política commit-author del core (f00082 ya es correcta).
- No enumerar hardcoded la lista completa de plugins en archivos de host: la fuente de verdad es el server (overview/agent_catalog/plugin_search).

## Slices

- global_gate: type

### S1 — Habilitar write tools + commitAuthor en este repo
- **Status**: done
- **Files**: `mcp-vertex.config.json`
- **Gate**: none
- acceptance:
  - "La config fija git.options.allowWrite=true manteniendo allowForge."
  - "La config declara commitAuthor explícito (modo git, autor = Cartago)."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: mecanismo commitAuthor mode:git verificado empíricamente (git config resuelve Cartago/cartago.relaxingcup@gmail.com correctamente). validate verde.
### S2 — DoD y knowledge del plugin git: commit+push al terminar
- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `plugins/git/src/index.ts`
- **Gate**: type
- acceptance:
  - "El bootstrap §5 (Definition of done) incluye commit+push en la identidad configurada del autor."
  - "El knowledge git-orientation instruye commit+push al terminar la tarea en ambos estados (allowWrite activado y desactivado)."

### S3 — Guía de adopción de plugins para LLMs + enlace
- **Status**: done
- **Files**: `docs/mcp-vertex/PLUGIN-CONFIGURATION-GUIDE.md`, `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`
- **Gate**: none
- acceptance:
  - "Existe una guía que explica descubrimiento de plugins (overview/agent_catalog/plugin_search), presets, y config por necesidad (git write/commitAuthor; rules/conventions/quality/test-convention para clean code, SOLID y arquitectura de archivos/naming) sin listar hardcoded todos los plugins."
  - "CROSS-PROJECT-SETUP enlaza la guía."

## acceptance

- La config fija git.options.allowWrite=true manteniendo allowForge.
- La config declara commitAuthor explícito (modo git, autor = Cartago).
- El bootstrap §5 (Definition of done) incluye commit+push en la identidad configurada del autor.
- El knowledge git-orientation instruye commit+push al terminar la tarea en ambos estados (allowWrite activado y desactivado).
- Existe una guía que explica descubrimiento de plugins (overview/agent_catalog/plugin_search), presets, y config por necesidad (git write/commitAuthor; rules/conventions/quality/test-convention para clean code, SOLID y arquitectura de archivos/naming) sin listar hardcoded todos los plugins.
- CROSS-PROJECT-SETUP enlaza la guía.
