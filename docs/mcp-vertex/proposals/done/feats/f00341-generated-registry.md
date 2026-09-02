---
id: f00341
title: "generated registry."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-registry
last-transition-id: 41c1e964-71da-4cb8-9d41-81b7ac9eb494
last-correlation-id: 41c1e964-71da-4cb8-9d41-81b7ac9eb494
last-transition-from: in-progress
---

# f00341 — generated registry.

## Goal

Migrated work item: generated registry..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00341-generated-registry.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/generate/from-manifests.script.spec.ts -> passing. Confirmed registry entries generated from manifests per MAN-003.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#generated-registry` by `proposal_adopt`
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
this item: TODO MAN-003 — Generator de registry, part of the plugin-manifests generator suite, line ~1979. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "generated-registry" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

MAN-003 ("Generator de registry", line ~1979, part of section 21's
generator suite) calls for generating the first-party plugin registry
from plugin manifests instead of a hand-maintained array.

Real derived acceptance: the first-party plugin registry entries must
be a generated artifact, produced from `plugin.manifest.ts` files by
a script, not manually written.

Already implemented, not net-new work:
`packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
is a generated file (`GENERATED_FIRST_PARTY_MANIFEST_ENTRIES`)
produced by `tools/scripts/generate/from-manifests.script.ts`
(`GENERATED_FIRST_PARTY_INDEX_PATH`), which discovers every plugin's
manifest via `discoverPluginManifests`/`parsePluginManifest` and
writes the registry entries (id, package, summary, tags, permissions,
tokenBudgetBytes) from that source of truth.

Ran `npx vitest run tools/scripts/generate/from-manifests.script.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
