# AGENT.md — plugin `plugins/i18n`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- i18n key/interpolation validation across locale JSON files.

## Public API

- checkLocales
- flattenKeys
- realI18nDeps
- extractUsedKeys
- validateInterpolation

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/i18n/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/i18n/tests/src/lib/check-i18n.spec.ts
- plugins/i18n/tests/src/lib/tools/i18n-check.tool.spec.ts
- plugins/i18n/tests/src/lib/tools/i18n-containment.spec.ts
- plugins/i18n/tests/src/lib/tools/i18n-validate.tool.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

