---
id: f00342
title: "generated preset data."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-preset-data
last-transition-id: 786f9fbc-ea85-4942-8e95-2ed8586a8630
last-correlation-id: 786f9fbc-ea85-4942-8e95-2ed8586a8630
last-transition-from: in-progress
---

# f00342 — generated preset data.

## Goal

Migrated work item: generated preset data..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00342-generated-preset-data.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/generate/from-manifests.script.spec.ts tools/scripts/lint/manifest-vs-presets.spec.ts -> passing. Confirmed generated preset/web-catalog data.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#generated-preset-data` by `proposal_adopt`
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
this item: the plugin-manifests generator suite (TODO MAN-004 Generator web / MAN-006 Generator token budgets) implying generated preset data from manifests, lines ~1981-1985. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "generated-preset-data" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

The generator suite in section 21 (MAN-003 through MAN-007) includes
generating the web catalog (MAN-004) and a compatibility matrix
between each plugin's declared presets and the actual preset
membership resolver — this is the "generated preset data" scope: web
catalog rows and preset compatibility must be derived from manifests,
not hand-authored, and must not silently drift from the real preset
resolver.

Real derived acceptance: plugin preset membership/catalog data
consumed by the web app must be generated from plugin manifests, and
a check must catch a manifest's declared presets disagreeing with the
real preset resolver.

Already implemented, not net-new work:
`tools/scripts/generate/from-manifests.script.ts` generates
`apps/web/src/data/plugins/catalog.generated.ts` (slug/displayName/
purpose/category per plugin) and
`apps/web/src/generated/plugin-manifest-catalog.generated.ts` from
manifests, and separately builds an `ICompatibilityRow[]` per
plugin×preset comparing the manifest's `declared` presets against
`resolvePresetMembers(presetId)` (`catalogMember`), flagging
`matches: declared === catalogMember`.
`tools/scripts/lint/manifest-vs-presets.script.ts` enforces that
comparison as a gate.

Ran
`npx vitest run tools/scripts/generate/from-manifests.script.spec.ts tools/scripts/lint/manifest-vs-presets.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
