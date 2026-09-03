# AGENT.md — plugin `plugins/issues-triage`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- INTERNAL-ONLY issue triage bot for the mcp-vertex repository: reads GitHub issues, classifies them mechanically, drafts fix proposals and replies automatically with a machine-disclosure notice. Never published to npm.

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
- @mcp-vertex/core
- @mcp-vertex/proposals

## Writes

- <host workspace>/.mcp-vertex/cache/issues-triage/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/issues-triage/tests/analysis.spec.ts
- plugins/issues-triage/tests/bot-notice.spec.ts
- plugins/issues-triage/tests/github.spec.ts
- plugins/issues-triage/tests/proposal-draft.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- plugins/issues-triage/src/lib/tools/triage.tools.ts

<!-- mcp-vertex:end agent-md -->

