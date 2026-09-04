# AGENT.md — plugin `plugins/issues-triage`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- INTERNAL-ONLY issue triage bot for the delendai repository: reads GitHub issues, classifies them mechanically, drafts fix proposals and replies automatically with a machine-disclosure notice. Never published to npm.

## Public API

- default
- AUTOMATED_NOTICE
- withBotNotice
- analyzeIssue
- kindForCategory
- titleForIssue
- buildProposalDraft
- BOT_REPLY_MARKER
- addComment
- addLabels
- fetchIssue
- ghExec
- listOpenIssues

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core
- @delendai/proposals

## Writes

- <host workspace>/.delendai/cache/issues-triage/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/issues-triage/tests/analysis.spec.ts
- plugins/issues-triage/tests/bot-notice.spec.ts
- plugins/issues-triage/tests/github.spec.ts
- plugins/issues-triage/tests/proposal-draft.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

