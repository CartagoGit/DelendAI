---
id: f00340
title: "plugin manifests."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#plugin-manifests
last-transition-id: 157f8bd1-b41d-47df-bf58-cd768585939f
last-correlation-id: 157f8bd1-b41d-47df-bf58-cd768585939f
last-transition-from: in-progress
---

# f00340 — plugin manifests.

## Goal

Migrated work item: plugin manifests..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: pending
- **Files**: `docs/mcp-vertex/proposals/review/f00340-plugin-manifests.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#plugin-manifests` by `proposal_adopt`
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
this item: section 21, 'Plugin manifests: propuesta detallada', with a full manifest schema example and TODO MAN-001 through MAN-010, lines ~1923-1990. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "plugin-manifests" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

Section 21 (lines ~1923-1990) specifies a `definePluginManifest`
schema (id/package/visibility/maturity/summary/tags/dependencies/
permissions/tokenProfile/presetHints) plus TODO MAN-001 (schema),
MAN-002 (lint), MAN-009/MAN-010 (detect packages without a manifest
and manifests without a package). The generator TODOs (MAN-003
through MAN-008) are covered separately by f00341/f00342/f00343.

Real derived acceptance: a typed, validated per-plugin manifest schema
must exist, every first-party plugin must declare one, and a lint
must catch both a public package missing a manifest and a manifest
with no backing package.

Already implemented, not net-new work:
`packages/core/src/lib/manifest/define-plugin-manifest.ts`
(`definePluginManifest`) implements the exact schema shape (id,
package, visibility, maturity, summary, tags, dependencies,
permissions, tokenBudget, presets) with Zod validation. Every first-
party plugin under `plugins/*/plugin.manifest.ts` uses it (confirmed:
`browser`, `rules`, `tech-debt`, `agent-orchestrator`, `status-marker`,
`security`, `quality`, `remote-provider-core`, `link-check`,
`auto-agent-selector`, `container`, `proposals`, `completion`,
`project-kpis`, `logs`, `refactor`, `web-fetch`, and more).
`tools/scripts/lint/plugin-manifest.script.ts`
(`lintPluginManifests`) reports `manifest-without-package` and
`public-package-missing-manifest` findings — MAN-009/MAN-010 — and
`tools/scripts/lint/manifest-vs-package.script.ts` cross-checks
manifest metadata against the real package/tool registration
(MAN-002).

Ran
`npx vitest run tools/scripts/lint/plugin-manifest.script.spec.ts tools/scripts/lint/manifest-vs-package.spec.ts tools/scripts/lint/manifest-vs-presets.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
