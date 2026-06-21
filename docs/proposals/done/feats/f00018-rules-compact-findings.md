---
id: f00018
status: done
type: proposal
track: rules+quality
date: 2026-06-21
closed: 2026-06-21
kind: feat
title: Add compact findings to rules checks
---

# f118 — Add compact findings to rules checks

## Goal

Close the remaining M11 `rules` gap by making missing ESLint packages
first-class findings and adding a compact `check_rules` response mode.

## Why

The rules plugin already calculates `missingEslintDeps`, but agents and
UIs still have to infer whether that is actionable. The audit calls this
out as the last low-risk rules-plugin polish item.

## Non-goals

- Executing ESLint or package installation.
- Changing rule preset detection.
- Removing the existing verbose response shape.

## Slices

### S1 — Compact check output and missing-deps findings
  - **Status**: done
  - **Files**: `plugins/rules/src/lib/tools/rules-tools.ts`, `plugins/rules/tests/src/lib/plugin.spec.ts`, `plugins/rules/src/generated/tool-outputs.ts`
  - **Command**: `bunx vitest run plugins/rules/tests/src/lib/plugin.spec.ts`
  - **Expect**: pass

## Acceptance

- [x] `check_rules` accepts `compact?: boolean`.
- [x] Missing ESLint packages are emitted as explicit findings.
- [x] Generated tool output types are updated.
- [x] `bun run validate` is green.
