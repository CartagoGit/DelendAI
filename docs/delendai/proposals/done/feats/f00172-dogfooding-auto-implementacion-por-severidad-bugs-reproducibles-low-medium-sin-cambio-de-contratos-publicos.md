---
id: f00172
title: "dogfooding: auto-implementación por severidad (bugs reproducibles low/medium sin cambio de contratos públicos)"
kind: feat
status: done
type: proposal
track: dogfooding
date: 2026-08-24
shipped-in:
  - 76b08455 # chore(proposals): f00172 → review
  - 87dd3020 # feat(f00172): política de auto-fix por severidad/contrato + cola auto-fixable
---

# f00172 — dogfooding: auto-implementación por severidad (bugs reproducibles low/medium sin cambio de contratos públicos)

## Goal

Permitir que el bucle dogfooding implemente automáticamente bugs confirmados de severidad low/medium que tengan reproducción (incidente o test) y que NO modifiquen contratos públicos, generando una propuesta y dejando un PR para revisión humana. Los cambios decision-sensitive (producto, diseño, seguridad, privacidad, contratos públicos, severidad high) quedan siempre como propuesta/issue para decisión humana.

## why

La conversación pide exactamente: "Corrige automáticamente únicamente bugs reproducibles de severidad baja/media que no modifiquen contratos públicos. Para el resto, crea propuestas y déjame las decisiones." Hoy el triage (f00158 S2) propone pero no ejecuta; falta la política que distingue ingeniería (auto-fixable) de decisión (humano) y la reutiliza sobre auto_work.

## non-goals

- No auto-merge: todo cambio pasa por PR y revisión humana.
- No tocar severidad high/security/privacy: siempre requieren humano.
- No modificar contratos públicos (outputSchema publicados, APIs del index público, presets estándar, manifests de plugin).
- No reimplementar auto_work/claim/close: reutilizarlos como motor de ejecución.

## Slices

- global_gate: type

### S1 — Política de severidad/contrato (guard puro)
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/auto-fix-policy.ts`
- **Gate**: type
- acceptance:
  - "autoFixPolicy es un guard puro: (incidente/borrador clasificado, severidad, contrato afectado) → auto-fixable | necesita-humano con razón."
  - "Clasifica severidad y detecta si el cambio toca contratos públicos (outputSchema, index público, presets, manifests)."
  - "Cubierto con tests unitarios para cada rama de decisión."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Cola auto-fixable + generación de propuesta (reutiliza auto_work)
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/auto-fix-queue.tool.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "Tool que lista bugs auto-fixables priorizados y genera la propuesta correspondiente (reutilizando create_proposal/auto_work, sin reimplementarlos)."
  - "Las propuestas auto-fixables llevan metadatos de severidad y contrato; las decision-sensitive se dejan como propuesta/issue para el humano."
  - "bun run validate verde con el nuevo contrato tipado."

## acceptance

- autoFixPolicy es un guard puro: (incidente/borrador clasificado, severidad, contrato afectado) → auto-fixable | necesita-humano con razón.
- Clasifica severidad y detecta si el cambio toca contratos públicos (outputSchema, index público, presets, manifests).
- Cubierto con tests unitarios para cada rama de decisión.
- Tool que lista bugs auto-fixables priorizados y genera la propuesta correspondiente (reutilizando create_proposal/auto_work, sin reimplementarlos).
- Las propuestas auto-fixables llevan metadatos de severidad y contrato; las decision-sensitive se dejan como propuesta/issue para el humano.
- bun run validate verde con el nuevo contrato tipado.
