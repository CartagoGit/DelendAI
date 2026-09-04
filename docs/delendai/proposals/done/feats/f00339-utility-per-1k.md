---
id: f00339
title: "utility per 1K."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#utility-per-1k
last-transition-id: 57e5dc2b-1264-4bd0-84b4-66af32f031f6
last-correlation-id: 57e5dc2b-1264-4bd0-84b4-66af32f031f6
last-transition-from: in-progress
---

# f00339 — utility per 1K.

## Goal

Migrated work item: utility per 1K..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00339-utility-per-1k.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run plugins/usage-tracking/tests/token-tax.spec.ts -> passing. Confirmed utilityPer1kTokens formula matches TOK-011 definition.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#utility-per-1k` by `proposal_adopt`
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
this item: TODO TOK-011 — Utility per 1K tokens, defining the metric as 'task success contribution / context cost' per plugin, lines ~1271-1283. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "utility-per-1k" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

Real derived acceptance (TOK-011, lines ~1271-1283): a per-plugin
metric measuring "task success contribution / context cost", scaled
per 1K tokens.

Already implemented, not net-new work:
`plugins/usage-tracking/src/lib/types.ts` declares
`pluginKpis[].utilityPer1kTokens: number` on `IUsageSummary`, and
`plugins/usage-tracking/src/lib/usage-kpis.helper.ts`
(`utilityPer1kTokensOf`) computes it exactly as specified: `0` when
`successContribution <= 0 || contextBytes <= 0`, otherwise
`successContribution / (contextBytes / (1_000 * BYTES_PER_TOKEN))`
— success contribution scaled by context cost per 1K tokens. Covered
by `plugins/usage-tracking/tests/token-tax.spec.ts` (via
`summarizeLocalKpis`, which builds the same `pluginKpis` rows). Ran
`npx vitest run plugins/usage-tracking/tests/token-tax.spec.ts` on
2026-09-02: passing. No code change required; closing on this
evidence.
