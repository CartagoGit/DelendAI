# AGENT.md — plugin `plugins/changelog`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Conventional-commits changelog + release plan generator.

## Public API

- parseConventionalCommit
- type IConventionalCommit
- type CommitType
- groupByType
- type IChangelogSection
- renderMarkdown
- inferBump
- buildReleasePlan
- buildReleasePlanToolRegistration
- buildChangelogGenerateToolRegistration

## Depends on

- @mcp-vertex/core
- zod

## Writes

- <host workspace>/.mcp-vertex/cache/changelog/

## Entry points

- ./src/index.ts
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/changelog/src/lib/bump/infer-bump.spec.ts
- plugins/changelog/src/lib/tools/changelog-generate.tool.spec.ts
- plugins/changelog/src/lib/tools/release-plan.tool.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

