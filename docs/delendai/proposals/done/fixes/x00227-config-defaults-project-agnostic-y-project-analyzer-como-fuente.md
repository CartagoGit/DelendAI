---
id: x00227
title: "config: defaults project-agnostic y project analyzer como fuente"
kind: fix
status: done
type: proposal
track: core
date: 2026-08-24
---

# x00227 — config: defaults project-agnostic y project analyzer como fuente

## Goal

Hacer que los defaults del paquete sean project-agnostic y que el project analyzer sea la fuente de los defaults específicos.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §13 CFG-001 — revisar defaults específicos de MCP Vertex (`docs/mcp-vertex`, `bun run validate`)
- §13 CFG-002 — project analyzer como fuente de defaults (package manager, language, test runner, lint/typecheck, docs/source roots)
- §13 CFG-003 — no materializar defaults que empeoren otros stacks (precedente de `search`)

Los defaults genéricos van al paquete; la config específica de este repo vive en el repo. El analyzer (`detect-stack`) detecta los comandos y roots y solo se materializan tras `init`.

## why

Defaults como `bun run validate` o `docs/mcp-vertex` rompen la promesa project-agnostic para proyectos Python/Go/Rust/npm/pnpm. El paquete debe ser genérico; la especificidad debe derivarse del análisis del proyecto.

## non-goals

- No cambiar la config real de este monorepo.
- No reescribir detect-stack entero (se extiende).
- No materializar defaults antes de init.

## Slices

- global_gate: type

### S1 — Defaults genéricos sin vocabulario del repo
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/plugin-defaults.ts`
- **Gate**: type
- acceptance:
  - "Los defaults no hardcodean docs/mcp-vertex ni bun run validate (CFG-001)."
  - "La config específica del repo se mueve a la config del repo."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Project analyzer como fuente de defaults
- **Status**: done
- **Files**: `packages/core/src/lib/config/detect-stack.ts`
- **Gate**: type
- acceptance:
  - "Detecta package manager, language, test runner, lint/typecheck, docs/source roots (CFG-002)."
  - "Los defaults materializados no empeoran stacks no-Bun (CFG-003)."

## acceptance

- Los defaults no hardcodean docs/mcp-vertex ni bun run validate (CFG-001).
- La config específica del repo se mueve a la config del repo.
- Detecta package manager, language, test runner, lint/typecheck, docs/source roots (CFG-002).
- Los defaults materializados no empeoran stacks no-Bun (CFG-003).
