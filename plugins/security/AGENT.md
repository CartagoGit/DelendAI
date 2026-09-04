# AGENT.md — plugin `plugins/security`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Security audit (CVEs, SAST, secrets, env).

## Public API

- scanSecrets
- runSecretScan
- realScanDeps
- parseAuditJson
- queryOsv
- runAuditCommand
- detectStack
- parseSastJson
- runSastRunner
- SAST_RULES
- SECRET_RULES

## Depends on

- @delendai/deps
- @delendai/web-fetch
- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/security/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/security/src/lib/deps/audit.spec.ts
- plugins/security/src/lib/deps/osv.spec.ts
- plugins/security/src/lib/deps/parsers.spec.ts
- plugins/security/src/lib/sast/parsers.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

