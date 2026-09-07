---
id: x00515
title: "capability resolver canonical identities and ambiguous bare-name failures"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-07
---

# x00515 — capability resolver canonical identities and ambiguous bare-name failures

## Goal

Harden CapabilityResolver so bare tool-name collisions fail explicitly, qualifiedName input is normalized once at the boundary, and every successful resolution returns the canonical pluginId/toolName/qualifiedName tuple.

## why

The current resolver still accepts raw qualifiedName input in some paths, resolves bare toolIds by first match, and can return non-canonical identities when the caller supplied a bare name or extra whitespace. That weakens telemetry, caching, permissions, and low-token recovery because the failure shape does not tell the caller whether the problem was ambiguity, invalid capability syntax, runtime drift, or a hidden tool that failed to materialize.

## non-goals

- Do not widen the MCP surface or re-open x00512/f00521.
- Do not change compact router routing here; this proposal only hardens identity resolution and its typed failures.
- Do not add plugin-specific code paths or real plugin fixtures.

## Slices

- global_gate: type

### S1 — Canonical identity resolution and typed ambiguous failures
- **Status**: pending
- **Files**: `packages/core/src/lib/dispatch/capability-resolver.identity.ts`, `packages/core/src/lib/dispatch/capability-resolver.error.ts`, `packages/core/src/lib/dispatch/capability-resolver.ts`, `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`, `packages/core/tests/src/lib/dispatch/capability-resolver.spec.ts`
- **Gate**: type
- acceptance:
  - "QualifiedName input is trimmed once at the boundary and the raw string is never used again downstream."
  - "Bare toolId lookup returns catalog_missing on zero matches, resolves on exactly one canonical match, and returns a typed ambiguous outcome with canonical candidates on multiple matches."
  - "Successful resolution always returns canonical pluginId, toolName, and qualifiedName derived from the catalog/runtime record rather than echoing caller input."
  - "Focused resolver tests cover whitespace normalization, canonical identity echo, and ambiguous bare-name collisions with synthetic fixtures only."
- review-state: in_review
- review-implementer: github-copilot
## acceptance

- QualifiedName input is trimmed once at the boundary and the raw string is never used again downstream.
- Bare toolId lookup returns catalog_missing on zero matches, resolves on exactly one canonical match, and returns a typed ambiguous outcome with canonical candidates on multiple matches.
- Successful resolution always returns canonical pluginId, toolName, and qualifiedName derived from the catalog/runtime record rather than echoing caller input.
- Focused resolver tests cover whitespace normalization, canonical identity echo, and ambiguous bare-name collisions with synthetic fixtures only.
