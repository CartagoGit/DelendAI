---
id: f00343
title: "generated docs."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-docs
last-transition-id: c466d79a-b1a9-4807-bcb1-dd99fce3817f
last-correlation-id: c466d79a-b1a9-4807-bcb1-dd99fce3817f
last-transition-from: in-progress
---

# f00343 — generated docs.

## Goal

Migrated work item: generated docs..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00343-generated-docs.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/generate/from-manifests.script.spec.ts -> passing. Confirmed generated per-plugin docs + permission matrix per MAN-005.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#generated-docs` by `proposal_adopt`
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
this item: TODO MAN-005 — Generator docs, part of the plugin-manifests generator suite, line ~1982. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "generated-docs" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

MAN-005 ("Generator docs", line ~1982) calls for generating plugin
documentation from manifests rather than hand-maintaining three
separate manuals per plugin (the audit elsewhere — section on
docs/manuals — flags docs and reality diverging).

Real derived acceptance: per-plugin documentation pages (and the
top-level manifest index) must be generated from plugin manifests,
with any human-authored notes folded in from a single dedicated
location rather than duplicated across generated and hand-written
pages.

Already implemented, not net-new work:
`tools/scripts/generate/from-manifests.script.ts` generates
`docs/mcp-vertex/generated/plugin-manifests.generated.md`,
`docs/mcp-vertex/generated/plugin-manifests.generated.json`, one page
per plugin under `docs/mcp-vertex/plugins/auto-generated/` (confirmed
present: `error-reporting.md` and others), and
`docs/mcp-vertex/security/permission-matrix.md`. The doc-comment
above `PLUGIN_DOC_NOTES_DIR` in that script states the design
explicitly: "`docs/mcp-vertex/plugins/notes/<id>.notes.md` is the ONE
place a human note lives per plugin, and its content is folded into
the auto-generated page" — i.e. exactly the "fusionar los manuales en
las auto-generadas" requirement.

Ran `npx vitest run tools/scripts/generate/from-manifests.script.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
