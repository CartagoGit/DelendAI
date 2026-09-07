---
id: f00521
title: "Stable brokered MCP surface keeps tools list bounded while the internal catalog grows"
kind: feat
status: ready
type: proposal
track: managed-surface
date: 2026-09-07
---

# f00521 — Stable brokered MCP surface keeps tools list bounded while the internal catalog grows

## Goal

Keep the public MCP surface small and stable in managed mode by brokering discovery, description and invocation through always-visible primitives, while internal plugin activation and warm eviction remain runtime-only concerns.

## why

Today DelendAI separates catalog size from warm runtime size, but the visible MCP surface still grows as tools are discovered or activated. That preserves lazy loading in memory, yet it lets tools/list drift upward over a session and weakens the token-budget win. The capability-resolver foundation already gives DelendAI a generic internal invocation path; this proposal finishes the boundary so 'callable' no longer implies 'listed'.

## why this design

The goal is not another visibility-LRU that churns tools/list up and down based on recent calls. MCP already gives DelendAI a better shape: keep a small, stable public tool surface and route discovery, description, and invocation through always-visible broker primitives. That lets the runtime keep its existing lazy activation and warm eviction policies without making the host's visible schema surface depend on per-session call history.

The existing foundation is close but incomplete. `resolve_capability` already embodies the generic invocation half of the broker contract, while the runtime already separates catalog, visibility, and hot handlers. The missing work is to finish the public boundary: expose the broker set in bootstrap, add one-shot capability description, converge the compact router on the same resolver path, and document the invariants so operators stop thinking "visible" and "callable" are synonyms.

## non-goals

- Do not make visibility-LRU churn the default MCP contract for normal hosts.
- Do not remove existing discovery/admin primitives such as tool_search or plugin_activate.
- Do not redesign plugin authoring or the internal catalog model.

## architecture

```text
small fixed MCP surface
  ├─ tool_search / discovery primitive
  ├─ on-demand capability details from discovery metadata
  └─ resolve_capability / invoke through the runtime catalog
       ↓
     internal DelendAI catalog
       ↓
   lazy plugin activation + warm eviction
```

Catalog size may keep growing. Warm runtime size may keep fluctuating. The visible MCP surface should stay intentionally small and almost constant.

## Slices

- global_gate: type

### S1 — Expose the generic capability broker in the always-visible bootstrap set
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/bootstrap-core-tool-ids.constant.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/tools/resolve-capability.tool.ts`, `packages/core/src/lib/dispatch/capability-resolver.ts`, `packages/core/tests/src/lib/e2e/tool-surface-resolve-capability.spec.ts`
- **Gate**: type
- acceptance:
  - "Managed mode always exposes the generic invocation broker without depending on incremental relisting."
  - "A focused spec proves the broker registration shape is stable, appears in the managed bootstrap set exactly once, and can invoke a hidden capability through lazy activation."
- review-state: done
- review-implementer: copilot-broker-surface
- review-reviewer: delivery-verifier-f00521-s1
- review-log: approved by delivery-verifier-f00521-s1
### S2 — Return on-demand capability details without widening the visible tool set
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/project/tool-surface-runtime.helper.ts`, `packages/core/src/lib/tools/knowledge-tool.ts`, `packages/core/tests/src/lib/e2e/tool-surface-capability-details.spec.ts`
- **Gate**: type
- acceptance:
  - "A caller can fetch schema-level details for one capability without exposing every tool schema in MCP."
  - "The details payload is derived from the same runtime catalog used by generic resolution and stays reachable through the existing `tool_search -> detailsId` path plus the brokered call into `knowledge`."
- review-state: done
- review-implementer: copilot-broker-surface
- review-reviewer: delivery-verifier-f00521-s2
- review-log: approved by delivery-verifier-f00521-s2
### S3 — Route compact router through the generic resolver instead of a parallel activation path
- **Status**: done
- **DependsOn**: [S1, S2]
- **Files**: `packages/core/src/lib/tools/compact-router.tool.ts`, `packages/core/tests/src/lib/e2e/compact-router-resolver.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Compact router calls hidden capabilities through the resolver path."
  - "The router result envelope remains schema-valid for existing e2e consumers by translating resolver terminal outcomes back to the existing router error envelope."

### S4 — Publish brokered-surface semantics in overview and operator docs
- **Status**: pending
- **DependsOn**: [S1, S2, S3]
- **Files**: `packages/core/src/lib/tools/overview-tool.ts`, `docs/delendai/AGENT-BOOTSTRAP.md`, `docs/delendai/ADOPTER-SURFACE-MODE.md`
- **Gate**: lint
- acceptance:
  - "Overview distinguishes catalog size, public surface size and warm runtime state."
  - "Bootstrap docs describe brokered invocation as the happy path in managed mode without hardcoded counts."

## dependency graph

S1 enables S2 and is a precondition for the full broker happy path.
S2 provides deferred schema inspection for S3 and S4.
S3 converges compact routing on the same invocation path.
S4 documents and reports the resulting semantics.

## acceptance

- Managed mode always exposes the generic invocation broker without depending on incremental relisting.
- A focused spec proves the broker registration shape is stable, appears in the managed bootstrap set exactly once, and can invoke a hidden capability through lazy activation.
- A caller can fetch schema-level details for one capability without exposing every tool schema in MCP.
- The details payload is derived from the same runtime catalog used by generic resolution and stays reachable through the existing `tool_search -> detailsId` path plus the brokered call into `knowledge`.
- Compact router calls hidden capabilities through the resolver path.
- The router result envelope remains schema-valid for existing e2e consumers by translating resolver terminal outcomes back to the existing router error envelope.
- Overview distinguishes catalog size, public surface size and warm runtime state.
- Bootstrap docs describe brokered invocation as the happy path in managed mode without hardcoded counts.

## risks and mitigations

- Risk: compact-router consumers rely on the current result envelope.
  Mitigation: converge through an explicit slice with e2e coverage instead of swapping the handler inline under S1.
- Risk: operators conflate "not in tools/list" with "not callable" and regress to manual activation rituals.
  Mitigation: S4 updates overview and bootstrap docs together with the code path.
- Risk: broad surface work collides with ongoing local edits in the same core files.
  Mitigation: keep S1-S4 file-disjoint where possible and claim them independently.

## notes

Related context already exists in x00512 (CapabilityResolver foundation) and the larger runtime plans under q00009 and q00011, but none of those proposals currently owns the stable brokered MCP boundary end to end. This proposal is the missing surface contract.
