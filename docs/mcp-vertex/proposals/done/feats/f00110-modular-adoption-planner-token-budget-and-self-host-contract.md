---
id: f00110
kind: feat
title: Modular adoption planner, token budget and self-host contract
status: done
type: proposal
track: architecture
date: 2026-07-12
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 1 commits referencing f00110 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 1-commit batch
shipped-in:
  - 44152b0a # fix(audit-a00052): close P0/P1 containment, injection and lifecycle findings
---

# f00110 — modular adoption planner token budget self host contract

## Goal

Redesign downstream adoption so the agent can choose replace, augment or selected capabilities; preserve existing agent/skill/MCP/proposal mechanisms; derive paths and namespace from the target; and keep discovery/planning payloads under enforced token budgets.

## Why

Dogfood real devuelve 213.088 bytes para el plan y deriva rutas/namespace que no
respetan el propio target. El consumidor necesita una decisión explícita entre
reemplazar, complementar o adoptar solo capacidades seleccionadas.

## Non-goals

- No migrar silenciosamente un proyecto consumidor.
- No eliminar mecanismos existentes sin consentimiento explícito.

## Slices

- global_gate: e2e

### S1 — Adoption strategy and contract
- **Files**: packages/core/src/lib/bootstrap/adoption-strategy.ts
- **Files**: packages/core/src/lib/bootstrap/schemas.ts
- **Files**: packages/core/tests/src/lib/bootstrap/adoption-strategy.spec.ts
- **Gate**: `bun run typecheck`
- **Status**: done
- **Verified finding (2026-07-13)**: the analyze/plan wire inputs had no adoption choice, so downstream code could only infer a destructive/non-destructive policy from `hasMcpProject`. The shared contract now accepts `replace`, `augment` or a non-empty partial capability selection; resolution is deterministic, rejects ambiguous selections, defaults existing projects to merge-only augmentation, preserves unselected capabilities and marks replacement of an existing MCP project as consent-sensitive.

### S2 — Bounded analyze and plan projections
- **Files**: packages/core/src/lib/bootstrap/analyze-tool.ts
- **Files**: packages/core/src/lib/bootstrap/plan-tool.ts
- **Files**: packages/core/src/lib/bootstrap/build-blueprint.ts
- **Files**: packages/core/tests/src/lib/bootstrap/plan-tool.spec.ts
- depends_on: [S1]
- **Gate**: `bun run test`
- **Status**: done
- **Verified finding (2026-07-13)**: production still registered a second, monolithic implementation from `bootstrap-tool.ts`; the split `analyze-tool.ts` / `plan-tool.ts` modules targeted by this proposal were never used by the real server, which is why a locally correct compact path still returned the legacy 21 KB payload over MCP. The aggregate is now composition-only, the old schema module is a compatibility re-export, compact analyze/plan results are measured, plan detail is lazy and paginated, and partial adoption filters blueprint/file materialization without emitting a replacement host config.

### S3 — Target layout and self-host correctness
- **Files**: packages/core/src/lib/scaffold/scaffold-host.ts
- **Files**: packages/core/src/lib/bootstrap/recommend-plan.ts
- **Files**: packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts
- depends_on: [S1]
- **Gate**: `bun run typecheck`
- **Status**: done
- **Verified finding (2026-07-13)**: host generation hardcoded every source/test and VS Code cwd to `libs/mcp-project`, while namespace derivation reduced the self-host package to `core`; using the real `mcp-vertex` prefix also emitted invalid TypeScript identifiers such as `MCP-VERTEX_*`. Plans now carry a target directory, existing consumers default to their root, the real monorepo resolves to `packages/core` + `mcp-vertex`, scaffold paths/cwd follow that target, augment mode never emits replacement host/config files, and generated symbols sanitize hyphenated namespaces without changing runtime tool names.

### S4 — Consumer migration and coexistence e2e
- **Files**: packages/core/tests/src/lib/bootstrap/adoption-modes.e2e.spec.ts
- **Files**: docs/mcp-vertex/examples/adoption-modes/README.md
- depends_on: [S2, S3]
- **Gate**: `bun run test`
- **Status**: done
- **Verified coverage (2026-07-13)**: a real filesystem consumer fixture now proves replace is consent-sensitive and may own the full host config, while augment/partial never return existing MCP, agent, instruction or source paths; partial tools-only adoption emits no prompts, skills or agents. A second dogfood fixture pins the repository's own `packages/core` + `mcp-vertex` target and rejects the former `libs/mcp-project` path and invalid hyphenated symbols. The documented examples cover all modes and compact pagination.

## Acceptance

- El modo compacto queda bajo presupuesto medido y el detalle es lazy/paginado.
- Replace, augment y partial producen planes distintos sin clobber.
- El repositorio pasa su propio fixture de adopción y respeta layout/prefix.
