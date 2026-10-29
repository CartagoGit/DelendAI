---
id: x00198
title: "a00084 MINOR-findings batch — persistQueue footgun, online-preset gaps, id-regex drift, hardcoded lang, path containment, logo diffing"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - d36c2b3a # fix(x00198): a00084 MINOR-findings batch (F15,F19,F20,F30,F32,F35,F36)
---

# x00198 — a00084 MINOR-findings batch — persistQueue footgun, online-preset gaps, id-regex drift, hardcoded lang, path containment, logo diffing

## Goal

Fix 7 remaining a00084 findings (#15, #19, #20, #30, #32, #35, #36), all low-severity/MINOR and independently scoped:
- #15: `persistQueue` had no mutex of its own (every caller happened to wrap it, but nothing enforced that) — renamed the raw write to `persistQueueUnlocked`, added a safe-by-default `persistQueue` wrapper that takes the mutex itself (reentrant-safe, so existing already-locked callers switch to the unlocked variant with zero behavior change).
- #19: `online-preset.ts`'s `psgallery` and `buf_registry` registries were mapped but had no response parser, silently falling through to `version: ''` → `ok:false`. Added a real parser for `psgallery` (verified live against the actual PowerShell Gallery OData/Atom XML API) and removed `buf_registry` (verified live: the BSR web page is a client-rendered SPA with no static version data, and it doesn't host the `buf` CLI's own releases anyway — no mapping is more honest than a permanently-broken one).
- #20: the registry's filename prefilter accepted unbounded trailing letters after the id's digit run (`[a-z]*`); tightened to a single optional legacy-residual letter (`[a-z]?`), matching the one real legacy form on disk (`f00067a-*.md`) without accepting arbitrary malformed ids that `frontmatter-linter.ts` would later reject.
- #30: the setup-github webview's `<html lang="en">` was hardcoded regardless of the host's persisted language; now threads the resolved `Lang` through.
- #32: `plugin-activation.service.ts` joined `configFileName` onto `workspaceRoot` with no containment check (not reachable from the VS Code UI today, but the service API accepted it); now routed through `resolveWorkspaceContained`.
- #35: `fetch-brand-logos.ts` treated two logos with the same byte count as "unchanged"; now compares actual bytes via `Buffer#equals`.
- #36: `brand-logos.spec.ts` hardcoded 16 plugin slugs while the manifest lists 45; now derives the expected set from `capabilities.json` (verified all 45 already have a real `plugin-<slug>.svg` on disk).

## why

All 7 are real, verified gaps (each independently confirmed by reading the current code and, where applicable, live-testing the actual external API) left over from the a00084 audit triage. Bundled into one proposal since each is small and file-disjoint, matching how x00195 bundled the prior BAD-severity batch.

## non-goals

- Centralizing frontmatter-linter.ts's ID_RE and the registry's filename regex into one shared Zod schema — tried this (importing newProposalIdSchema), but it broke a real, deliberate test (the retired `p` legacy prefix + kind:legacy combo) because newProposalIdSchema's WRITE-seam prefix restriction is a different, stricter concern than frontmatter-linter's shape-only check. Reverted; kept the two checks as separately-scoped hand-rolled regexes with the one real divergence (trailing-letter looseness) fixed.

## Slices

- global_gate: type

### S1 — F15 — persistQueue mutex footgun
- **Status**: done
- **Files**: `plugins/proposals/src/lib/agents/persistent-task-queue.ts`, `plugins/proposals/src/lib/agents/task-queue-engine.ts`, `plugins/proposals/src/lib/agents/promote-on-release.ts`, `plugins/proposals/src/lib/tools/agent-names.tool.ts`
- **Gate**: type
- acceptance:
  - "persistQueueUnlocked is the raw write; persistQueue wraps it in withFileMutex"
  - "all in-repo callers that already hold the lock call persistQueueUnlocked directly"
  - "bun test plugins/proposals passes (1115/1115)"

### S2 — F19 — online-preset.ts psgallery parser + buf_registry removal
- **Status**: done
- **Files**: `plugins/rules/src/lib/frameworks/online-preset.ts`, `plugins/rules/tests/src/lib/online-preset.spec.ts`
- **Gate**: type
- acceptance:
  - "psgallery has a real OData/Atom XML parser branch, verified against the live PowerShell Gallery API"
  - "buf_registry removed (no working anonymous API; verified live)"
  - "bun test plugins/rules/tests/src/lib/online-preset.spec.ts passes (23/23)"

### S3 — F20 — sync-proposal-registry filename id-shape tightening
- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "filename filter uses [a-z]? not [a-z]* for the trailing-letter residual suffix"
  - "f00067a-style legacy files still index; x1abcd-style malformed ids do not"
  - "bun test plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts passes"

### S4 — F30 — setup-github webview hardcoded lang=en
- **Status**: done
- **Files**: `extensions/vscode/src/webviews/setup-github.ts`, `extensions/vscode/src/commands/setup-github.ts`, `extensions/vscode/src/test/setup-github.spec.ts`
- **Gate**: type
- acceptance:
  - "<html lang> reflects the resolved host language, not a hardcoded en"
  - "bun test extensions/vscode passes (224/225, 1 pre-existing unrelated vi.stubGlobal failure)"

### S5 — F32 — plugin-activation.service.ts config path containment
- **Status**: done
- **Files**: `packages/client/src/lib/services/plugin-activation.service.ts`, `packages/client/src/tests/plugin-activation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "configFileName is resolved via resolveWorkspaceContained, rejecting escapes and absolute paths"
  - "bun test packages/client passes (157/157)"

### S6 — F35+F36 — brand-logo content diffing + manifest-derived test coverage
- **Status**: done
- **Files**: `apps/web/scripts/fetch-brand-logos.ts`, `apps/web/tests/lib/brand-logos.spec.ts`
- **Gate**: type
- acceptance:
  - "fetch-brand-logos.ts compares actual bytes (Buffer#equals), not just byteLength"
  - "brand-logos.spec.ts derives the expected plugin slug set from capabilities.json (45 packages) instead of a hardcoded 16"
  - "bun test apps/web passes (209/209)"

## acceptance

- persistQueueUnlocked is the raw write; persistQueue wraps it in withFileMutex
- all in-repo callers that already hold the lock call persistQueueUnlocked directly
- bun test plugins/proposals passes (1115/1115)
- psgallery has a real OData/Atom XML parser branch, verified against the live PowerShell Gallery API
- buf_registry removed (no working anonymous API; verified live)
- bun test plugins/rules/tests/src/lib/online-preset.spec.ts passes (23/23)
- filename filter uses [a-z]? not [a-z]* for the trailing-letter residual suffix
- f00067a-style legacy files still index; x1abcd-style malformed ids do not
- bun test plugins/proposals/tests/src/lib/proposals/sync-proposal-registry.spec.ts passes
- <html lang> reflects the resolved host language, not a hardcoded en
- bun test extensions/vscode passes (224/225, 1 pre-existing unrelated vi.stubGlobal failure)
- configFileName is resolved via resolveWorkspaceContained, rejecting escapes and absolute paths
- bun test packages/client passes (157/157)
- fetch-brand-logos.ts compares actual bytes (Buffer#equals), not just byteLength
- brand-logos.spec.ts derives the expected plugin slug set from capabilities.json (45 packages) instead of a hardcoded 16
- bun test apps/web passes (209/209)
