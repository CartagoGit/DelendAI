---
id: c00087
title: "Zero-warning biome baseline — clear the 12 warnings + 31 infos and keep the gate at zero"
kind: chore
status: in-progress
type: proposal
track: lint
date: 2026-07-14
---

# c00087 — Zero-warning biome baseline — clear the 12 warnings + 31 infos and keep the gate at zero

## Goal

biome ci reports 12 warnings + 31 infos across 1977 files, all FIXABLE and concentrated in plugins/external-mcps (useLiteralKeys in pending-acks.ts, suggest.tool.ts and 3 specs), tools/scripts/dev/api/setup-install.ts (useTemplate) and apps/shared/src/lib/escape.spec.ts (useTemplate). Fix them (mostly `biome check --write`), eyeball the diff per the merged-codemod lesson, and keep the baseline at zero so the count can never quietly grow again.

## why

Audit a00054 F-4. A warning count that is nonzero-but-tolerated trains everyone to ignore the linter; 43 findings is small enough to clear in one slice and cheap enough to keep at zero.

## non-goals

- No rule-set changes — fix the code to the current rules, don't relax rules to the code.

## Slices

- global_gate: e2e

### S1 — Auto-fix + review the 43 findings; assert zero warnings in the lint gate
- **Status**: pending
- **Files**: `plugins/external-mcps/src/lib/ack/pending-acks.ts`, `plugins/external-mcps/src/lib/tools/suggest.tool.ts`, `plugins/external-mcps/tests/src/lib/plugin-composition.spec.ts`, `plugins/external-mcps/tests/src/lib/suggest-ack.spec.ts`, `plugins/external-mcps/tests/src/lib/validate-config.spec.ts`, `tools/scripts/dev/api/setup-install.ts`, `apps/shared/src/lib/escape.spec.ts`
- **Gate**: e2e
- acceptance:
  - "bunx biome ci . reports 0 warnings (infos ideally 0 too; any survivor documented inline)."
  - "External-mcps + shared + dev-api suites stay green; diff reviewed file-by-file, not trusted blindly."

## acceptance

- bunx biome ci . reports 0 warnings (infos ideally 0 too; any survivor documented inline).
- External-mcps + shared + dev-api suites stay green; diff reviewed file-by-file, not trusted blindly.
