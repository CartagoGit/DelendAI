---
id: x00208
title: "Scaffold de host greenfield: exponer las herramientas que promete y packaging completo"
kind: fix
status: done
type: proposal
track: scaffold
date: 2026-08-23
---

# x00208 — Scaffold de host greenfield: exponer las herramientas que promete y packaging completo

## Goal

Que `scaffold { kind: "host" }` sobre un proyecto nuevo produzca un servidor MCP que registre de verdad `overview` y las herramientas de bootstrap que sus propios agentes e instrucciones prometen, y que el paquete greenfield sea autónomo (package.json, tsconfig, README, registro .codex/config.toml) y use UNA sola estrategia de mcp.json, coherente con la del CLI.

## why

Auditoría 2026-08-24 (hallazgos A1, A3, A5, A6, A7): `createMcpProject` llama `planRegistrationOrder([], extras)` con núcleo vacío, así que el host greenfield solo registra `scaffold`; sin embargo `.github/copilot-instructions.md` dice "Entry point: overview (ALWAYS the first call)" y los agentes referencian auto_work/analyze_project/plan_mcp_project/create_project/agent_lock. El LLM llama a `overview` y no existe — es el fallo nº1 que lo descarrila. Además analyze_project recomienda un mcp.json (CLI) distinto del que genera el scaffold (host propio), y falta packaging (package.json/tsconfig/README) y .codex/config.toml.

## non-goals

- No tocar el bootstrap analyze/plan/create (ver propuesta refactor bootstrap).
- No tocar proposals/adopt ni migrate-foreign.
- No tocar la creación de plugins (wire-plugin, create-plugin).
- No implementar el tool de adopción end-to-end (propuesta feat).

## Slices

- global_gate: type

### S1 — Host generado registra overview + bootstrap y es autónomo
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/bootstrap/host-config-rules.ts`
- **Gate**: type
- acceptance:
  - "scaffoldHostConfigFile registra overview y las meta-tools de bootstrap además de scaffold."
  - "El greenfield emite package.json, tsconfig.json y README con instrucciones de arranque."
  - "Se emite .codex/config.toml junto a los agentes Codex."
  - "El texto de instrucciones y agentes solo nombra herramientas que el host realmente expone."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Una sola estrategia de mcp.json
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/scaffold/detect-existing-install.ts`
- **Gate**: type
- acceptance:
  - "El mcp.json generado por scaffold coincide con la estrategia del CLI (o se elimina la duplicidad documentándolo)."
  - "La autodetección existingMcpVertex/mcpServerName (x00201) sigue activa y testeada."
- implementation:
  - "La duplicidad se elimina documentándola: el README generado describe los dos caminos de arranque (servidor propio plugin-less vs CLI con --preset full)."
  - "La autodetección x00201 queda intacta y sigue cubierta por detect-existing-install.spec.ts (sin cambios de comportamiento)."

### S3 — createMcpProject permite registrar las meta-tools core
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/standalone-core-tools.ts`, `packages/core/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "Existe un camino (helper o config) para que un host propio registre overview/bootstrap sin reimplementar el CLI."
  - "planRegistrationOrder sigue determinista y falla rápido ante duplicados/anchors desconocidos."

### S4 — Tests de contrato del scaffold de host
- **Status**: done
- **Files**: `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`
- **Gate**: type
- acceptance:
  - "Test de contrato: herramientas prometidas en agentes/instrucciones ⊆ herramientas registradas por el host."
  - "Test golden del greenfield: artefactos emitidos y arranque validado."

## acceptance

- scaffoldHostConfigFile registra overview y las meta-tools de bootstrap además de scaffold.
- El greenfield emite package.json, tsconfig.json y README con instrucciones de arranque.
- Se emite .codex/config.toml junto a los agentes Codex.
- El texto de instrucciones y agentes solo nombra herramientas que el host realmente expone.
- El mcp.json generado por scaffold coincide con la estrategia del CLI (o se elimina la duplicidad documentándolo).
- La autodetección existingMcpVertex/mcpServerName (x00201) sigue activa y testeada.
- Existe un camino (helper o config) para que un host propio registre overview/bootstrap sin reimplementar el CLI.
- planRegistrationOrder sigue determinista y falla rápido ante duplicados/anchors desconocidos.
- Test de contrato: herramientas prometidas en agentes/instrucciones ⊆ herramientas registradas por el host.
- Test golden del greenfield: artefactos emitidos y arranque validado.
