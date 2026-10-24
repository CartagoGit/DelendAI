---
id: x00513
title: "Absolute plugin specifiers keep the original import failure instead of masquerading as missing first-party sources"
kind: fix
status: done
type: proposal
track: plugins
date: 2026-09-07
shipped-in: ["5d76af489"]
last-transition-id: 9973671d-0798-4549-942d-eaac2f417f72
last-correlation-id: 9973671d-0798-4549-942d-eaac2f417f72
last-transition-from: ready
---

# x00513 — Absolute plugin specifiers keep the original import failure instead of masquerading as missing first-party sources

## Goal

When a plugin specifier is an absolute path or other non-first-party locator, nodeDynamicImport must preserve the real import failure instead of rewriting it as a missing local @delendai/* source under the workspace.

## why

The current error path in packages/core/src/lib/plugins/load-plugins.ts slices every failing specifier as if it were @delendai/<pkg>, so an absolute path can produce nonsense expected paths and hide the actionable root cause. External integrations then look like broken first-party packages instead of a plain dependency-resolution failure.

## why this design

The loader already has the right separation point: local first-party source resolution only applies to real @delendai/* packages, while every other specifier should keep Node's native import semantics. The smallest correct fix is therefore to guard the synthesized workspace diagnostic behind the same first-party predicate that already gates the happy path. That repairs the misleading error without changing timeout, dependency, registration, or disposal behavior.

## non-goals

- Do not redesign external plugin packaging or dependency injection.
- Do not change successful first-party source resolution for real @delendai/* packages.
- Do not broaden the loader timeout, dependency, or disposal behavior.

## architecture

```text
specifier
  ├─ startsWith('@delendai/')
  │    ├─ try local workspace source
  │    └─ on failure: synthesize first-party diagnostic with checked paths
  └─ any other locator (absolute path, relative path, file URL, third-party pkg)
       └─ preserve the original import failure
```

## Slices

- global_gate: type

### S1 — Guard first-party fallback diagnostics behind real @delendai/* specifiers
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/load-plugins.ts`, `packages/core/tests/src/lib/plugins/load-plugins.spec.ts`
- **Gate**: type
- acceptance:
  - "An absolute-path plugin specifier that fails to import rejects with the original import error, not a synthesized 'local first-party plugin source not found' message."
  - "A real missing @delendai/* package still reports the first-party fallback diagnostic with the checked workspace paths."
  - "The focused loader spec is green."
- review-state: done
- review-implementer: copilot-surface-followup
- review-reviewer: delivery-verifier-x00513
- review-log: approved by delivery-verifier-x00513
## dependency graph

S1 is self-contained.

## acceptance

- An absolute-path plugin specifier that fails to import rejects with the original import error, not a synthesized 'local first-party plugin source not found' message.
- A real missing @delendai/* package still reports the first-party fallback diagnostic with the checked workspace paths.
- The focused loader spec is green.

## risks and mitigations

- Risk: a too-broad guard could suppress the helpful workspace diagnostic for real first-party packages.
  Mitigation: keep the predicate identical to the existing local-source happy path and preserve the current @delendai/* regression spec.
- Risk: import error strings vary across Node versions.
  Mitigation: the regression spec asserts the absence of the synthesized first-party message and only checks for the missing plugin stem, not an exact Node error sentence.

## notes

This proposal comes directly from a real external-plugin startup failure where an absolute path was later reinterpreted as a missing first-party package under the workspace. The bug is diagnostic, but it actively hides the actionable fix from plugin authors.
