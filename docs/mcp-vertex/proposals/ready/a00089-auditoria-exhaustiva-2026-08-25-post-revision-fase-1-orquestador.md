---
id: a00089
title: "Auditoría exhaustiva 2026-08-25 — post-revisión Fase 1 (orquestador)"
kind: audit
status: ready
type: proposal
track: audit+proposals+security+concurrency
date: 2026-08-25
---

# a00089 — Auditoría exhaustiva 2026-08-25 — post-revisión Fase 1 (orquestador)

## Goal

Auditoría exhaustiva propia (independiente, previa a leer la auditoría ChatGPT/sol legacy) de packages/core, cada plugin relevante, apps/web, tools/scripts, la extensión VSCode y el propio sistema de propuestas: bugs con evidencia, calidad de código, diseño, arquitectura, naming/duplicación, puntuación 0-10 por eje y roadmap de mejora priorizado.

## why

Cierre de Fase 2 del encargo del usuario 2026-08-25: tras completar la Fase 1 (revisión empírica de 59 propuestas en review/, con 6 bugs reales encontrados y corregidos), se requiere una auditoría objetiva de todo el proyecto que sirva de mapa de calidad y backlog priorizado, sin contaminarse con la auditoría ChatGPT/sol previa hasta estar terminada.

## non-goals

- Reabrir o repetir la revisión de las 59 propuestas ya cerradas en Fase 1 (ver commits 22b5593b..82243085).
- Arreglar en línea cada hallazgo — esta auditoría es de diagnóstico; los fixes concretos se abren como propuestas hijas si el usuario lo pide.
- Auditar plugins/proposals de la propia auditoría ChatGPT/sol en curso (q00004 y su cluster x00236-x00245/t00007-009/i00004-011), por ser trabajo de otro agente activo en el mismo worktree, todavía sin implementar.

## Slices

- global_gate: none

### S1 — Informe consolidado de auditoría
- **Status**: pending
- **Files**: `docs/mcp-vertex/audits/2026-08-25-orchestrator-audit-fase2.md`
- **Gate**: none
- acceptance:
  - "El documento cubre packages/core, plugins/proposals, plugins/error-reporting, plugins/client (transporte), apps/web, tools/scripts, extensión VSCode y el sistema de propuestas."
  - "Incluye bugs con archivo+línea+escenario, puntuación 0-10 por sección y eje, ranking, lista priorizada de bugs y roadmap."
  - "Sección separada documentando qué se añadió tras leer la auditoría ChatGPT/sol legacy."

## acceptance

- El documento cubre packages/core, plugins/proposals, plugins/error-reporting, plugins/client (transporte), apps/web, tools/scripts, extensión VSCode y el sistema de propuestas.
- Incluye bugs con archivo+línea+escenario, puntuación 0-10 por sección y eje, ranking, lista priorizada de bugs y roadmap.
- Sección separada documentando qué se añadió tras leer la auditoría ChatGPT/sol legacy.
