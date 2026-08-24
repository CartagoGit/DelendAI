---
id: c00128
title: "versionado: política de versiones del monorepo y lint de dependency-versions"
kind: chore
status: ready
type: proposal
track: core
date: 2026-08-24
---

# c00128 — versionado: política de versiones del monorepo y lint de dependency-versions

## Goal

Establecer una política de versiones del monorepo y un lint de dependency-versions con allowlist.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §17 VER-001 — política de versiones (allowlist: typescript default + excepciones como apps/web)
- §17 VER-002 — `lint:dependency-versions` (fallar solo ante drift no justificado)

Hoy core/cli/client declaran TypeScript 7.0.2 y web 6.0.3, con diferencias también en el MCP SDK. No es necesariamente un bug, pero en un monorepo que comparte contratos conviene declarar explícitamente qué divergencias están permitidas.

## why

Divergencias silenciosas de TS/SDK entre paquetes pueden producir builds no reproducibles y contratos incompatibles. Una política explícita con allowlist convierte el drift en una decisión documentada, no en un accidente.

## non-goals

- No forzar una única versión en todo el monorepo (se admite allowlist).
- No actualizar versiones en esta propuesta.
- No tocar el lockfile.

## Slices

- global_gate: type

### S1 — Política de versiones con allowlist
- **Status**: done
- **Files**: `docs/mcp-vertex/DEPENDENCY-VERSIONS.md`
- **Gate**: type
- acceptance:
  - "Documenta default + excepciones por paquete (VER-001)."

### S2 — Lint de dependency-versions
- **Status**: done
- **Files**: `tools/scripts/lint/dependency-versions.script.ts`
- **Gate**: type
- acceptance:
  - "Falla solo ante drift no justificado (VER-002)."
  - "Integrado en bun run validate."

## acceptance

- Documenta default + excepciones por paquete (VER-001).
- Falla solo ante drift no justificado (VER-002).
- Integrado en bun run validate.
