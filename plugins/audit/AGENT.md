# AGENT.md — plugin `plugins/audit`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.

## Public API

- buildBrief
- ALL_SCOPES
- SCOPE_LABEL
- parseAuditBody
- parseAuditFiles
- consolidateAudits
- renderConsolidationMarkdown
- auditDateStamp
- auditFilename
- callLlm
- callLlmFanOut
- isoDate
- resolveTarget
- proposalFilenameFor

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/audit/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/audit/tests/src/lib/plugin-options.spec.ts
- plugins/audit/tests/src/lib/self-audit/aggregate.spec.ts
- plugins/audit/tests/src/lib/self-audit/file-proposals.spec.ts
- plugins/audit/tests/src/lib/self-audit/rank.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `delendai_audit_audit_run` — 3,710 B total, 2,245 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_audit_audit_consolidate` — 2,963 B total, 2,199 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

