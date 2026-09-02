---
id: f00337
title: "adaptive tools."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#adaptive-tools
last-transition-id: 7558b6ca-7577-4f7f-8ae4-4dc4b6d7ff3a
last-correlation-id: 7558b6ca-7577-4f7f-8ae4-4dc4b6d7ff3a
last-transition-from: in-progress
---

# f00337 — adaptive tools.

## Goal

Migrated work item: adaptive tools..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00337-adaptive-tools.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: done
- review-implementer: sonnet-worker-migrated
- review-reviewer: sonnet-verifier-migrated
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run packages/core/tests/src/lib/surface/decide-mode.spec.ts packages/core/tests/src/lib/surface/bootstrap.spec.ts packages/core/tests/src/lib/project/tool-surface-runtime.spec.ts packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts -> 4 files, 30 tests passing. Confirmed managed/native/adaptive/compact modes satisfy TOK-006.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#adaptive-tools` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

### Reopened 2026-09-01

Verified against the record instead of trusting the review-log. The
review-log's claim that "no actionable scope can be derived without
the source" does not hold up: the migration source,
`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`,
was never actually gone — it existed in git history at commit
`e83d7da0f` (2026-08-24) and was only removed from the working tree in
`b08aae828` (2026-08-30, the same day this proposal was generated). It
was recoverable with a single `git show
e83d7da0f:docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`
the entire time, and it contains substantive, specific content for
this item: TODO TOK-006 — Activación dinámica de tools, describing a suggested minimal bootstrap tool set, lines ~1186-1200. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "adaptive-tools" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

TOK-006 ("Activación dinámica de tools", lines ~1190-1214) proposes a
minimal bootstrap surface — `overview`, `project_context`,
`tool_search`, `plugin_activate`, `configuration_center` — with the
rest of the catalog loaded on demand, and a static fallback for hosts
that don't handle dynamic `tools/list` changes well.

Real derived acceptance: the server must support a small default
bootstrap tool surface with the rest of the catalog reachable
on-demand, alongside a static/native fallback mode for hosts without
dynamic-surface support, selectable per host/config.

Already implemented, not net-new work:
`docs/mcp-vertex/ADOPTER-SURFACE-MODE.md` documents exactly this —
`managed` (default) is a "6-tool bootstrap surface (`overview`,
`tool_search`, `plugin_activate`, `plugin_deactivate`, `status`,
`vertex`) — the rest of the catalog is reachable via the `vertex`
router without being exposed in `tools/list`" — while `native` is the
static fallback for clients that don't handle `tools/list_changed`.
`packages/core/src/lib/surface/decide-mode.ts`
(`resolveInitialSurfaceMode`, `shouldRegisterSurfaceRouter`) and
`packages/core/src/lib/contracts/interfaces/surface-mode.interface.ts`
implement four surface modes (`native`/`managed`/`adaptive`/`compact`)
with capability-detection-based fallback to `native` for unknown
hosts (see the doc-comment on `resolveInitialSurfaceMode`'s caller in
that file). Covered by `packages/core/tests/src/lib/surface/decide-mode.spec.ts`,
`bootstrap.spec.ts`, and `packages/core/tests/src/lib/project/tool-surface-runtime*.spec.ts`.

Ran
`npx vitest run packages/core/tests/src/lib/surface/decide-mode.spec.ts packages/core/tests/src/lib/surface/bootstrap.spec.ts packages/core/tests/src/lib/project/tool-surface-runtime.spec.ts packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts`
on 2026-09-02: 4 files, 30 tests passing. No code change required;
closing on this evidence.
